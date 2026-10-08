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
    function open() { lock.hidden = true; body.hidden = false; onReady(); }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      set(form.senha.value.trim()); msg.textContent = "Verificando…";
      var fd = new FormData(); fd.append("verificar", "1");
      post("/verificar", fd).then(function (j) {
        if (j.ok) { msg.textContent = ""; open(); } else { msg.textContent = j.erro || "Senha incorreta."; }
      }).catch(function () { msg.textContent = "Sem conexão. Tente de novo."; });
    });
    document.querySelectorAll("[data-sair]").forEach(function (b) { b.addEventListener("click", function () { set(""); location.reload(); }); });
    if (get()) { var fd = new FormData(); fd.append("verificar", "1"); post("/verificar", fd).then(function (j) { if (j.ok) open(); }); }
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
