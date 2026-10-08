// English via Google Translate. Google's script only loads after a
// visitor picks a language; the choice lives in Google's "googtrans" cookie,
// so it carries across pages until they switch back to Portuguese.
(function () {
  var host = location.hostname;
  function current() {
    var m = document.cookie.match(/(?:^|;\s*)googtrans=\/pt\/([a-z-]+)/i);
    return m ? m[1] : "pt";
  }
  function setLang(lang) {
    var gone = ";expires=Thu, 01 Jan 1970 00:00:00 GMT";
    var val = lang === "pt" ? "" : "/pt/" + lang;
    [";path=/", ";path=/;domain=" + host, ";path=/;domain=." + host].forEach(function (scope) {
      document.cookie = "googtrans=" + val + scope + (lang === "pt" ? gone : "");
    });
  }
  var lang = current();
  if (lang !== "pt" && lang !== "en") { setLang("pt"); lang = "pt"; }
  document.documentElement.setAttribute("data-lang", lang);

  document.querySelectorAll("[data-lang]").forEach(function (btn) {
    if (btn === document.documentElement) return;
    var l = btn.getAttribute("data-lang");
    btn.setAttribute("aria-pressed", l === lang ? "true" : "false");
    btn.addEventListener("click", function () {
      if (l === lang) return;
      setLang(l);
      location.reload();
    });
  });

  if (lang === "pt") return;

  // Hand-written labels Google gets wrong ("Início" became "Start", "Sobre" became "On").
  var T = {
    en: {
      "Início": "Home", "Sobre mim": "About me", "Terapia": "Therapy", "Reflexões": "Reflections", "Contato": "Contact",
      "Agendar": "Book a session", "Agendar pelo WhatsApp": "Book on WhatsApp", "Como funciona": "How it works",
      "Psicoterapia online para adultos": "Online therapy for adults",
      "PSICÓLOGA · CRP 08/34535": "PSYCHOLOGIST · CRP 08/34535",
      "Você não precisa atravessar isso sozinha.": "You don't have to go through this alone."
    }
  }[lang] || {};
  document.querySelectorAll(".nav a, .brand small, .btn, .ruled, .foot-quote, .foot-cols a").forEach(function (el) {
    var key = el.textContent.replace(/\s+/g, " ").trim();
    if (T[key]) {
      var arrow = el.querySelector(".arrow");
      el.textContent = T[key];
      if (arrow) { el.append(" "); el.appendChild(arrow); }
      el.classList.add("notranslate");
    }
  });

  // Sessions are in Portuguese only, so English visitors see that up front.
  var main = document.getElementById("main");
  if (main) {
    var note = document.createElement("div");
    note.className = "lang-note notranslate";
    note.setAttribute("lang", "en");
    note.innerHTML = '<div class="wrap"><strong>Sessions are offered in Portuguese only.</strong> This English version is an automatic translation, so you can read about Bruna\'s work. <button type="button" data-lang-back>Ver em português</button></div>';
    main.insertBefore(note, main.firstChild);
    note.querySelector("[data-lang-back]").addEventListener("click", function () { setLang("pt"); location.reload(); });
  }

  window.googleTranslateElementInit = function () {
    new google.translate.TranslateElement({ pageLanguage: "pt", includedLanguages: "en", autoDisplay: false }, "gt-el");
  };
  var s = document.createElement("script");
  s.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
  document.body.appendChild(s);
})();
