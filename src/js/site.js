(function () {
  // Menu (mobile)
  var btn = document.querySelector('.menu-btn');
  var nav = document.getElementById('nav');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.textContent = open ? 'Fechar' : 'Menu';
    });
  }

  // "Ver versão desktop" toggle
  var vp = document.querySelector('meta[name="viewport"]');
  var mobileContent = vp ? vp.getAttribute('content') : '';
  function store(k, v) { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function setDesktop(on) {
    if (vp) vp.setAttribute('content', on ? 'width=1200' : mobileContent);
    document.documentElement.classList.toggle('force-desktop', on);
    document.querySelectorAll('.desktop-toggle').forEach(function (b) {
      b.textContent = on ? 'Ver versão mobile' : 'Ver versão desktop';
    });
    store('desktop', on ? '1' : null);
  }
  document.querySelectorAll('.desktop-toggle').forEach(function (b) {
    b.addEventListener('click', function () { setDesktop(!document.documentElement.classList.contains('force-desktop')); });
  });
  if (read('desktop') === '1') setDesktop(true);

  // Visit counter for Bruna's private stats page (no cookies, nothing personal).
  try {
    var api = document.body.getAttribute('data-api');
    if (api && !document.documentElement.hasAttribute('data-private') && /psicologabrunaribeiro\.com$/.test(location.hostname)) {
      var nova = !sessionStorage.getItem('v'); sessionStorage.setItem('v', '1');
      navigator.sendBeacon(api + '/visita', new Blob([JSON.stringify({ p: location.pathname, r: document.referrer, n: nova })], { type: 'text/plain' }));
    }
  } catch (e) {}

  // Year
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  // Contact form (Web3Forms)
  var form = document.getElementById('contact-form');
  if (form) {
    var status = document.getElementById('form-status');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status.className = 'form-status';
      if (!form.checkValidity()) { form.reportValidity(); return; }
      if (form.botcheck && form.botcheck.checked) return;
      var key = form.access_key.value;
      if (!key) {
        status.className = 'form-status err';
        status.textContent = 'O formulário ainda está sendo configurado. Enquanto isso, fale comigo pelo WhatsApp.';
        return;
      }
      var submit = form.querySelector('button[type="submit"]');
      submit.disabled = true; submit.textContent = 'Enviando…';
      fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      }).then(function (r) { return r.json(); }).then(function (data) {
        if (data.success) {
          form.reset();
          status.className = 'form-status ok';
          status.textContent = 'Mensagem enviada. Respondo pelo e-mail que você informou.';
        } else { throw new Error(data.message); }
      }).catch(function () {
        status.className = 'form-status err';
        status.textContent = 'Não foi possível enviar agora. Tente de novo ou fale comigo pelo WhatsApp.';
      }).finally(function () {
        submit.disabled = false; submit.textContent = 'Enviar mensagem';
      });
    });
  }
})();
