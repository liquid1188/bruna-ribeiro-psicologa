// Publishes a new Reflexão to Bruna's site. The form at /escrever/ posts here
// with a password; this Worker holds the GitHub key, so Bruna never needs one.
// Also serves her visit stats at /estatisticas from Cloudflare Web Analytics.
// Secrets (set with wrangler): EDITOR_PASSWORD, GITHUB_TOKEN, CF_ANALYTICS_TOKEN.
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
async function put(env, path, contentB64, message) {
  const r = await gh(env, `contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({ message, content: contentB64, branch: BRANCH, committer: { name: "Bruna Ribeiro (site)", email: "psicologabrunaribeiro@gmail.com" } }),
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
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
    if (!env.EDITOR_PASSWORD || !(await same(senha, env.EDITOR_PASSWORD))) {
      await new Promise((r) => setTimeout(r, 800));
      return reply(origin, 401, { ok: false, erro: "Senha incorreta." });
    }
    if (form.get("verificar")) return reply(origin, 200, { ok: true });
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
      // New posts go to the top of the list.
      const list = await gh(env, `contents/src/reflexoes?ref=${BRANCH}`);
      let ordem = 1;
      if (list.ok) {
        const files = (await list.json()).filter((f) => f.name.endsWith(".md"));
        const nums = await Promise.all(files.map(async (f) => {
          const t = await (await fetch(f.download_url)).text();
          const m = t.match(/^ordem:\s*(-?\d+)/m); return m ? Number(m[1]) : 99;
        }));
        ordem = Math.min(1, ...nums) - 1;
      }

      let slug = slugify(title), n = 2;
      while (await exists(env, `src/reflexoes/${slug}.md`)) slug = `${slugify(title)}-${n++}`;

      let imagem = "";
      const foto = form.get("foto");
      if (foto && typeof foto === "object" && foto.size > 0) {
        if (foto.size > MAX_PHOTO) return reply(origin, 400, { ok: false, erro: "A foto é grande demais. Tente uma foto menor." });
        const ext = (foto.type.split("/")[1] || "jpg").replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "");
        const path = `src/images/reflexoes/${slug}.${ext}`;
        await put(env, path, b64(new Uint8Array(await foto.arrayBuffer())), `Foto da reflexão: ${title}`);
        imagem = `/images/reflexoes/${slug}.${ext}`;
      }

      const fm = { title, categoria, ordem, destaqueInicio: destaque, resumo, frase };
      if (imagem) { fm.imagem = imagem; fm.imagemAlt = String(form.get("fotoAlt") || "").trim(); }
      const md = "---\n" + Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n") + "\n---\n" + texto.replace(/\r\n/g, "\n") + "\n";
      await put(env, `src/reflexoes/${slug}.md`, b64text(md), `Nova reflexão: ${title}`);

      return reply(origin, 200, { ok: true, url: `/reflexoes/${slug}/` });
    } catch (e) {
      return reply(origin, 502, { ok: false, erro: "Não foi possível publicar agora. Tente de novo em alguns minutos ou fale com o Andrew." });
    }
  },
};
