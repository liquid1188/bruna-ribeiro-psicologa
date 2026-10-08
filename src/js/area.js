// Shared helpers for Bruna's private pages (/escrever/, /painel/).
window.Area = (function () {
  var api = document.body.getAttribute("data-api");
  function get() { try { return sessionStorage.getItem("area-senha") || ""; } catch (e) { return ""; } }
  function set(v) { try { v ? sessionStorage.setItem("area-senha", v) : sessionStorage.removeItem("area-senha"); } catch (e) {} }
  function post(path, fd) {
    fd.append("senha", get());
    return fetch(api + path, { method: "POST", body: fd }).then(function (r) {
      return r.json().catch(function () { return { ok: false, erro: "Resposta inválida do servidor." }; }).then(function (j) {
        if (r.status === 401) set("");
        return j;
      });
    });
  }
  function gate(onReady) {
    var lock = document.getElementById("area-lock"), body = document.getElementById("area-body");
    var form = document.getElementById("area-login"), msg = document.getElementById("area-login-msg");
    var nova = document.getElementById("area-nova"), nf = document.getElementById("area-nova-form"), nm = document.getElementById("area-nova-msg");
    var trocando = false, aberto = false;
    function open() { lock.hidden = true; nova.hidden = true; body.hidden = false; if (!aberto) { aberto = true; onReady(); } }
    function pedirNova(troca) {
      trocando = troca; lock.hidden = true; body.hidden = true; nova.hidden = false;
      document.getElementById("area-atual-campo").hidden = !troca;
      document.getElementById("area-nova-intro").textContent = troca ? "Trocar a sua senha." : "Bem-vinda! Agora crie a sua senha. Só você vai saber qual é.";
      nf.nova.focus();
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      set(form.senha.value.trim()); msg.textContent = "Verificando…";
      var fd = new FormData(); fd.append("verificar", "1");
      post("/verificar", fd).then(function (j) {
        if (j.ok && j.definir) { msg.textContent = ""; pedirNova(false); }
        else if (j.ok) { msg.textContent = ""; open(); }
        else { msg.textContent = j.erro || "Senha incorreta."; }
      }).catch(function () { msg.textContent = "Sem conexão. Tente de novo."; });
    });
    nf.addEventListener("submit", function (e) {
      e.preventDefault(); nm.className = "form-status";
      if (nf.nova.value.length < 8) { nm.className = "form-status err"; nm.textContent = "A senha precisa ter pelo menos 8 caracteres."; return; }
      if (nf.nova.value !== nf.nova2.value) { nm.className = "form-status err"; nm.textContent = "As duas senhas não são iguais."; return; }
      if (trocando) set(nf.atual.value);
      var fd = new FormData(); fd.append("nova", nf.nova.value);
      post("/definir-senha", fd).then(function (j) {
        if (j.ok) { set(nf.nova.value); nf.reset(); nm.className = "form-status ok"; nm.textContent = "Senha salva."; setTimeout(open, 700); }
        else { nm.className = "form-status err"; nm.textContent = j.erro || "Não foi possível salvar."; }
      }).catch(function () { nm.className = "form-status err"; nm.textContent = "Sem conexão. Tente de novo."; });
    });
    document.querySelectorAll("[data-sair]").forEach(function (b) { b.addEventListener("click", function () { set(""); location.reload(); }); });
    document.querySelectorAll("[data-trocar]").forEach(function (b) { b.addEventListener("click", function () { pedirNova(true); }); });
    if (get()) { var fd = new FormData(); fd.append("verificar", "1"); post("/verificar", fd).then(function (j) { if (j.ok && !j.definir) open(); }); }
  }
  // Shrinks a phone photo to at most 1600px and about 85% JPEG before upload.
  function shrink(file) {
    return new Promise(function (res) {
      if (!file || !/^image\//.test(file.type)) return res(null);
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.width, img.height));
        var c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) { res(b ? new File([b], "foto.jpg", { type: "image/jpeg" }) : file); }, "image/jpeg", 0.85);
      };
      img.onerror = function () { res(file); }; img.src = url;
    });
  }
  return { post: post, gate: gate, shrink: shrink };
})();
