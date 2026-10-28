/* Social links page — consent banner + small page helpers. No dependencies. */
(function () {
  'use strict';

  /* ---------- Settings ---------- */
  var COOKIE = 'cookie_consent';
  var POLICY_VERSION = 1;        // raise this when the Cookie Policy changes: everyone is asked again
  var MAX_AGE_DAYS = 365;        // how long the choice is remembered
  var OPTIONAL = ['preferences', 'statistics', 'marketing'];
  var LABELS = { functional: 'Functional', preferences: 'Preferences', statistics: 'Statistics', marketing: 'Marketing' };

  /* ---------- Cookie helpers ---------- */
  function readConsent() {
    var match = document.cookie.match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]*)'));
    if (!match) return null;
    try {
      var data = JSON.parse(decodeURIComponent(match[1]));
      if (!data || data.v !== POLICY_VERSION || !Array.isArray(data.c)) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function writeConsent(categories) {
    var data = {
      v: POLICY_VERSION,
      c: ['functional'].concat(categories.filter(function (c) { return OPTIONAL.indexOf(c) !== -1; })),
      t: new Date().toISOString().slice(0, 10)
    };
    var cookie = COOKIE + '=' + encodeURIComponent(JSON.stringify(data)) +
      '; Max-Age=' + (MAX_AGE_DAYS * 86400) + '; Path=/; SameSite=Lax';
    if (location.protocol === 'https:') cookie += '; Secure';
    document.cookie = cookie;
    return data;
  }

  function allowed(category, consent) {
    return category === 'functional' || (!!consent && consent.c.indexOf(category) !== -1);
  }

  /* ---------- Load scripts that wait for consent ----------
     <script type="text/plain" data-consent="statistics" data-src="assets/js/stats.js"></script> */
  function runAllowedScripts(consent) {
    var waiting = document.querySelectorAll('script[type="text/plain"][data-consent]');
    Array.prototype.forEach.call(waiting, function (old) {
      if (!allowed(old.getAttribute('data-consent'), consent)) return;
      var s = document.createElement('script');
      if (old.getAttribute('data-src')) s.src = old.getAttribute('data-src');
      s.defer = true;
      old.parentNode.replaceChild(s, old);
    });
  }

  /* ---------- Banner ---------- */
  var banner = document.getElementById('consent');
  var prefs = document.getElementById('consent-prefs');
  var fab = document.querySelector('.consent-fab');
  var statusEl = document.getElementById('consent-status');
  var btnPrefs = banner && banner.querySelector('[data-consent="prefs"]');
  var btnSave = banner && banner.querySelector('[data-consent="save"]');
  var lastFocus = null;

  function describe(consent) {
    if (!consent) return 'not set yet';
    var names = consent.c.map(function (c) { return LABELS[c] || c; });
    return names.join(', ') + ' (chosen on ' + consent.t + ')';
  }

  function syncUi(consent) {
    if (statusEl) statusEl.textContent = describe(consent);
    if (fab) fab.hidden = !consent || !banner.hidden;
    if (prefs) {
      OPTIONAL.forEach(function (c) {
        var box = prefs.elements[c];
        if (box) box.checked = allowed(c, consent);
      });
    }
  }

  function showPrefs(show) {
    prefs.hidden = !show;
    btnSave.hidden = !show;
    btnPrefs.hidden = show;
    btnPrefs.setAttribute('aria-expanded', String(show));
  }

  function openBanner(withPrefs) {
    lastFocus = document.activeElement;
    syncUi(readConsent());
    showPrefs(!!withPrefs);
    banner.hidden = false;
    if (fab) fab.hidden = true;
    banner.querySelector('#consent-title').focus();
  }

  function tellTheme(consent) {
    if (window.siteTheme) window.siteTheme.consentChanged(consent);
  }

  function closeBanner(consent) {
    banner.hidden = true;
    tellTheme(consent);
    syncUi(consent);
    runAllowedScripts(consent);
    if (lastFocus && lastFocus !== document.body && document.contains(lastFocus)) lastFocus.focus();
  }

  if (banner) {
    banner.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-consent]');
      if (!btn) return;
      var action = btn.getAttribute('data-consent');
      if (action === 'accept') closeBanner(writeConsent(OPTIONAL));
      else if (action === 'deny') closeBanner(writeConsent([]));
      else if (action === 'prefs') { showPrefs(true); prefs.querySelector('input:not([disabled])').focus(); }
      else if (action === 'save') {
        closeBanner(writeConsent(OPTIONAL.filter(function (c) {
          return prefs.elements[c] && prefs.elements[c].checked;
        })));
      }
    });

    banner.addEventListener('keydown', function (e) {
      // Esc closes the banner only if a choice already exists (it never counts as consent)
      if (e.key === 'Escape' && readConsent()) closeBanner(readConsent());
    });

    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-consent-open]')) { e.preventDefault(); openBanner(true); }
    });

    var current = readConsent();
    tellTheme(current);
    if (current) {
      syncUi(current);
      runAllowedScripts(current);
    } else {
      lastFocus = null;
      showPrefs(false);
      banner.hidden = false;
      syncUi(null);
    }
  }

  /* ---------- Page helpers ---------- */

  // Profile photo missing → show the "MI" monogram instead
  var avatarImg = document.getElementById('avatar-img');
  function noPhoto() { avatarImg.parentNode.classList.add('no-photo'); }
  if (avatarImg) {
    if (avatarImg.complete && avatarImg.naturalWidth === 0) noPhoto();
    avatarImg.addEventListener('error', noPhoto);
  }

  // QR image missing → hide the QR box, keep the vCard button
  var qr = document.getElementById('qr');
  var qrImg = qr && qr.querySelector('img');
  function noQr() { qr.classList.add('is-missing'); }
  if (qrImg) {
    if (qrImg.complete && qrImg.naturalWidth === 0) noQr();
    qrImg.addEventListener('error', noQr);
  }

  // Footer year
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
