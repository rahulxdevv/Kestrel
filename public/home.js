/* Kestrel landing page, no dependencies, ~1 KB. */
(function () {
  'use strict';

  var toggle = document.querySelector('[data-nav-toggle]');
  var mobile = document.querySelector('[data-nav-mobile]');
  if (toggle && mobile) {
    toggle.addEventListener('click', function () {
      // The open/close icons swap via CSS on [aria-expanded].
      toggle.setAttribute('aria-expanded', String(mobile.classList.toggle('open')));
    });
    mobile.addEventListener('click', function (e) {
      if (e.target && e.target.tagName === 'A') {
        mobile.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  document.querySelectorAll('[data-copy]').forEach(function (button) {
    button.addEventListener('click', function () {
      var card = button.closest('.deploy-card');
      var code = card && card.querySelector('code');
      if (!code || !navigator.clipboard) return;
      navigator.clipboard.writeText(code.innerText).then(function () {
        var label = button.textContent;
        button.textContent = 'Copied';
        setTimeout(function () {
          button.textContent = label;
        }, 1600);
      });
    });
  });

  var year = document.querySelector('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());
})();
