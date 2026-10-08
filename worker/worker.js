// Publishes a new Reflexão to Bruna's site. The form at /escrever/ posts here
// with a password; this Worker holds the GitHub key, so Bruna never needs one.
// Also serves her visit stats at /estatisticas from Cloudflare Web Analytics.
// Bruna sets her own password: the first time she enters a one-time SETUP_CODE,
// then chooses a password, stored only as a salted PBKDF2 hash in KV (SENHAS).
// Secrets (set with wrangler): SETUP_CODE, GITHUB_TOKEN, CF_ANALYTICS_TOKEN.
const REPO = "liquid1188/bruna-ribeiro-psicologa";
const BRANCH = "main";
const ORIGINS = ["https://www.psicologabrunaribeiro.com", "https://psicologabrunaribeiro.com"];
const ACCOUNT = "adb544ec9a3ae90fcc9badce066c96ec";
const SITE_TAG = "38184fbd464f4db1b6551426acef9400";
const MAX_PHOTO = 4 * 1024 * 1024;

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}
function reply(origin, status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });
}
async function same(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let d = 0; for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function pbkdf2(pass, saltHex) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256));
}
async function checkPassword(env, senha) {
  const rec = await env.SENHAS.get("senha", "json");
  if (!rec || !senha) return false;
  return same(await pbkdf2(senha, rec.salt), rec.hash);
}
async function setPassword(env, nova) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  await env.SENHAS.put("senha", JSON.stringify({ salt, hash: await pbkdf2(nova, salt), em: new Date().toISOString() }));
}

function slugify(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "reflexao";
}
function b64(bytes) {
  let s = ""; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}
function b64text(t) { return b64(new TextEncoder().encode(t)); }

async function gh(env, path, init = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "bruna-site-editor", "Content-Type": "application/json", ...(init.headers || {}) },
  });
  return r;
}
async function exists(env, path) {
  const r = await gh(env, `contents/${path}?ref=${BRANCH}`);
  return r.status === 200;
}
async function put(env, path, contentB64, message, sha) {
  const r = await gh(env, `contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({ message, content: contentB64, branch: BRANCH, ...(sha ? { sha } : {}), committer: { name: "Bruna Ribeiro (site)", email: "psicologabrunaribeiro@gmail.com" } }),
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
}

function unb64(b) { const bin = atob(b.replace(/\n/g, "")); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); }
function parsePost(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const data = {};
  if (!m) return { data, body: text };
  m[1].split("\n").forEach((line) => {
    const i = line.indexOf(":"); if (i < 0) return;
    const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
    try { data[k] = JSON.parse(v); } catch { data[k] = v.replace(/^["']|["']$/g, ""); }
  });
  return { data, body: m[2].replace(/\n$/, "") };
}
function validSlug(slug) { return /^[a-z0-9-]{1,80}$/.test(slug); }
async function readPost(env, slug) {
  const r = await gh(env, `contents/src/reflexoes/${slug}.md?ref=${BRANCH}`);
  if (!r.ok) return null;
  const j = await r.json();
  return { sha: j.sha, ...parsePost(unb64(j.content)) };
}
async function del(env, path, sha, message) {
  const r = await gh(env, `contents/${path}`, { method: "DELETE", body: JSON.stringify({ message, sha, branch: BRANCH, committer: { name: "Bruna Ribeiro (site)", email: "psicologabrunaribeiro@gmail.com" } }) });
  if (!r.ok && r.status !== 404) throw new Error(`GitHub ${r.status}`);
}
async function shaOf(env, path) {
  const r = await gh(env, `contents/${path}?ref=${BRANCH}`); return r.ok ? (await r.json()).sha : null;
}

async function stats(env, days) {
  const end = new Date(), start = new Date(end - days * 864e5);
  const filter = { AND: [{ datetime_geq: start.toISOString(), datetime_leq: end.toISOString() }, { siteTag: SITE_TAG }, { bot: 0 }] };
  const g = (alias, dim, limit, order) => `${alias}: rumPageloadEventsAdaptiveGroups(filter: $f, limit: ${limit}${order ? `, orderBy: [${order}]` : ""}) { count sum { visits } ${dim ? `dimensions { ${dim} }` : ""} }`;
  const query = `query($a: string, $f: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject) { viewer { accounts(filter: { accountTag: $a }) {
    ${g("total", "", 1)} ${g("dias", "date", 100, "date_ASC")} ${g("paginas", "requestPath", 10, "count_DESC")}
    ${g("paises", "countryName", 10, "count_DESC")} ${g("origens", "refererHost", 10, "count_DESC")} ${g("aparelhos", "deviceType", 5, "count_DESC")} } } }`;
  const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST", headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { a: ACCOUNT, f: filter } }),
  });
  const j = await r.json();
  if (j.errors && j.errors.length) throw new Error(j.errors[0].message);
  const a = j.data.viewer.accounts[0];
  const rows = (arr, key) => (arr || []).map((x) => ({ nome: x.dimensions[key] || "", visualizacoes: x.count, visitas: x.sum.visits }));
  return {
    dias: days,
    total: { visualizacoes: a.total[0]?.count || 0, visitas: a.total[0]?.sum.visits || 0 },
    porDia: rows(a.dias, "date"), paginas: rows(a.paginas, "requestPath"), paises: rows(a.paises, "countryName"),
    origens: rows(a.origens, "refererHost"), aparelhos: rows(a.aparelhos, "deviceType"),
  };
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
    if (req.method !== "POST") return reply(origin, 405, { ok: false, erro: "Método não permitido." });

    let form;
    try { form = await req.formData(); } catch { return reply(origin, 400, { ok: false, erro: "Formulário inválido." }); }
    const senha = String(form.get("senha") || "");
    const path = new URL(req.url).pathname;
    const temSenha = !!(await env.SENHAS.get("senha"));
    const codigoOk = !temSenha && env.SETUP_CODE && senha && (await same(senha, env.SETUP_CODE));
    const senhaOk = codigoOk ? false : await checkPassword(env, senha);

    if (path === "/definir-senha") {
      if (!codigoOk && !senhaOk) { await new Promise((r) => setTimeout(r, 800)); return reply(origin, 401, { ok: false, erro: temSenha ? "Senha atual incorreta." : "Código incorreto." }); }
      const nova = String(form.get("nova") || "");
      if (nova.length < 8) return reply(origin, 400, { ok: false, erro: "A nova senha precisa ter pelo menos 8 caracteres." });
      await setPassword(env, nova);
      return reply(origin, 200, { ok: true });
    }
    if (codigoOk) return reply(origin, 200, { ok: true, definir: true });
    if (!senhaOk) {
      await new Promise((r) => setTimeout(r, 800));
      return reply(origin, 401, { ok: false, erro: temSenha ? "Senha incorreta." : "Use o código de acesso que o Andrew enviou." });
    }
    if (form.get("verificar")) return reply(origin, 200, { ok: true });

    if (path === "/listar") {
      const r = await gh(env, `contents/src/reflexoes?ref=${BRANCH}`);
      if (!r.ok) return reply(origin, 502, { ok: false, erro: "Não foi possível carregar a lista." });
      const files = (await r.json()).filter((f) => f.name.endsWith(".md"));
      const posts = await Promise.all(files.map(async (f) => {
        const p = await readPost(env, f.name.replace(/\.md$/, "")); const data = p ? p.data : {};
        return { slug: f.name.replace(/\.md$/, ""), title: data.title || f.name, categoria: data.categoria || "", ordem: Number(data.ordem ?? 99), destaque: !!data.destaqueInicio, foto: !!data.imagem };
      }));
      posts.sort((a, b) => a.ordem - b.ordem);
      return reply(origin, 200, { ok: true, posts });
    }
    if (path === "/obter") {
      const slug = String(form.get("slug") || "");
      if (!validSlug(slug)) return reply(origin, 400, { ok: false, erro: "Reflexão inválida." });
      const p = await readPost(env, slug);
      if (!p) return reply(origin, 404, { ok: false, erro: "Reflexão não encontrada." });
      return reply(origin, 200, { ok: true, slug, ...p.data, texto: p.body });
    }
    if (path === "/apagar") {
      const slug = String(form.get("slug") || "");
      if (!validSlug(slug)) return reply(origin, 400, { ok: false, erro: "Reflexão inválida." });
      const p = await readPost(env, slug);
      if (!p) return reply(origin, 404, { ok: false, erro: "Reflexão não encontrada." });
      try {
        await del(env, `src/reflexoes/${slug}.md`, p.sha, `Reflexão apagada: ${p.data.title || slug}`);
        if (p.data.imagem && String(p.data.imagem).startsWith("/images/reflexoes/")) {
          const ip = "src" + p.data.imagem; const isha = await shaOf(env, ip);
          if (isha) await del(env, ip, isha, `Foto apagada: ${p.data.title || slug}`);
        }
        return reply(origin, 200, { ok: true });
      } catch (e) { return reply(origin, 502, { ok: false, erro: "Não foi possível apagar agora. Tente de novo." }); }
    }
    if (new URL(req.url).pathname === "/estatisticas") {
      const d = Math.min(Math.max(parseInt(form.get("dias") || "30", 10) || 30, 1), 90);
      try { return reply(origin, 200, { ok: true, ...(await stats(env, d)) }); }
      catch (e) { return reply(origin, 502, { ok: false, erro: "Não foi possível carregar os números agora." }); }
    }

    const title = String(form.get("title") || "").trim();
    const texto = String(form.get("texto") || "").trim();
    if (!title || !texto) return reply(origin, 400, { ok: false, erro: "Preencha pelo menos o título e o texto." });
    const categoria = String(form.get("categoria") || "Reflexão").trim();
    const resumo = String(form.get("resumo") || "").trim() || texto.split(/\n+/)[0].slice(0, 220);
    const frase = String(form.get("frase") || "").trim();
    const destaque = form.get("destaque") === "sim";

    try {
      const editSlug = String(form.get("slug") || "");
      let slug, ordem, sha = null, old = null;
      if (editSlug) {
        if (!validSlug(editSlug)) return reply(origin, 400, { ok: false, erro: "Reflexão inválida." });
        old = await readPost(env, editSlug);
        if (!old) return reply(origin, 404, { ok: false, erro: "Essa reflexão não existe mais." });
        slug = editSlug; sha = old.sha; ordem = Number(old.data.ordem ?? 1);
      } else {
        // New posts go to the top of the list.
        const list = await gh(env, `contents/src/reflexoes?ref=${BRANCH}`);
        ordem = 1;
        if (list.ok) {
          const files = (await list.json()).filter((f) => f.name.endsWith(".md"));
          const nums = await Promise.all(files.map(async (f) => {
            const t = await (await fetch(f.download_url)).text();
            const m = t.match(/^ordem:\s*(-?\d+)/m); return m ? Number(m[1]) : 99;
          }));
          ordem = Math.min(1, ...nums) - 1;
        }
        slug = slugify(title); let n = 2;
        while (await exists(env, `src/reflexoes/${slug}.md`)) slug = `${slugify(title)}-${n++}`;
      }

      let imagem = old && !form.get("removerFoto") ? String(old.data.imagem || "") : "";
      let imagemAlt = String(form.get("fotoAlt") || (old ? old.data.imagemAlt || "" : "")).trim();
      if (old && form.get("removerFoto") && old.data.imagem && String(old.data.imagem).startsWith("/images/reflexoes/")) {
        const ip = "src" + old.data.imagem; const isha = await shaOf(env, ip);
        if (isha) await del(env, ip, isha, `Foto removida: ${title}`);
      }
      const foto = form.get("foto");
      if (foto && typeof foto === "object" && foto.size > 0) {
        if (foto.size > MAX_PHOTO) return reply(origin, 400, { ok: false, erro: "A foto é grande demais. Tente uma foto menor." });
        const ext = (foto.type.split("/")[1] || "jpg").replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "");
        const ipath = `src/images/reflexoes/${slug}-${Date.now().toString(36)}.${ext}`;
        await put(env, ipath, b64(new Uint8Array(await foto.arrayBuffer())), `Foto da reflexão: ${title}`);
        if (imagem && imagem.startsWith("/images/reflexoes/")) { const isha = await shaOf(env, "src" + imagem); if (isha) await del(env, "src" + imagem, isha, `Foto trocada: ${title}`); }
        imagem = ipath.replace(/^src/, "");
      }

      const fm = { title, categoria, ordem, destaqueInicio: destaque, resumo, frase };
      if (imagem) { fm.imagem = imagem; fm.imagemAlt = imagemAlt; }
      const md = "---\n" + Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n") + "\n---\n" + texto.replace(/\r\n/g, "\n") + "\n";
      await put(env, `src/reflexoes/${slug}.md`, b64text(md), `${old ? "Reflexão editada" : "Nova reflexão"}: ${title}`, sha);

      return reply(origin, 200, { ok: true, url: `/reflexoes/${slug}/` });
    } catch (e) {
      return reply(origin, 502, { ok: false, erro: "Não foi possível publicar agora. Tente de novo em alguns minutos ou fale com o Andrew." });
    }
  },
};
