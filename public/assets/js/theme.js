/* Social links page — light/dark theme.
   Loaded in <head> without "defer" so the right theme is set before the page
   is drawn (no flash). Keep it small.

   Storage (see the Cookie Policy):
   - A choice is kept for this visit only (sessionStorage), which is a
     functional, user-requested setting.
   - It's remembered across visits (localStorage) only if the visitor allows
     "Preferences" in the cookie banner. Withdrawing Preferences deletes it. */
(function () {
  'use strict';

  var DEFAULT = 'system';   // 'system' = follow the device; or 'dark' / 'light' to always start that way
  var KEY = 'theme';
  var COLORS = { dark: '#1F2022', light: '#F5F3EF' };   // browser bar color (keep = --c-primary)
  var root = document.documentElement;

  function get(store) {
    try { var v = window[store].getItem(KEY); return v === 'light' || v === 'dark' ? v : null; }
    catch (e) { return null; }
  }
  function put(store, v) { try { window[store].setItem(KEY, v); } catch (e) {} }
  function drop(store) { try { window[store].removeItem(KEY); } catch (e) {} }

  function systemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  function chosen() { return get('localStorage') || get('sessionStorage'); }
  function current() { return root.getAttribute('data-theme') || systemTheme(); }

  function prefsAllowed() {
    var c = window.siteConsent;   // set by main.js
    return !!(c && c.c && c.c.indexOf('preferences') !== -1);
  }

  function syncUi() {
    var t = current();
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) {
      // With an explicit choice, both media variants show the chosen color
      metas[i].setAttribute('content', root.hasAttribute('data-theme')
        ? COLORS[t]
        : COLORS[metas[i].getAttribute('media') === '(prefers-color-scheme: light)' ? 'light' : 'dark']);
    }
    var btns = document.querySelectorAll('[data-theme-toggle]');
    for (var j = 0; j < btns.length; j++) {
      var label = t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
      btns[j].setAttribute('aria-label', label);
      btns[j].setAttribute('title', label);
    }
  }

  function apply(t) {
    if (t) root.setAttribute('data-theme', t);
    else root.removeAttribute('data-theme');
    syncUi();
  }

  function set(t) {
    apply(t);
    put('sessionStorage', t);
    if (prefsAllowed()) put('localStorage', t);
  }

  // Called by main.js whenever the cookie choice is known or changes
  function consentChanged(consent) {
    window.siteConsent = consent;
    if (prefsAllowed()) {
      var s = get('sessionStorage');
      if (s) put('localStorage', s);
    } else {
      drop('localStorage');
    }
  }

  // 1. Before drawing: apply the saved choice, else the site default
  var start = chosen() || (DEFAULT === 'light' || DEFAULT === 'dark' ? DEFAULT : null);
  if (start) root.setAttribute('data-theme', start);

  window.siteTheme = { set: set, current: current, consentChanged: consentChanged };

  // 2. After the page loads: wire up the button(s)
  document.addEventListener('DOMContentLoaded', function () {
    syncUi();
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-theme-toggle]');
      if (btn) set(current() === 'dark' ? 'light' : 'dark');
    });
  });

  // Follow live system changes while no choice has been made
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: light)');
    var onChange = function () { if (!root.hasAttribute('data-theme')) syncUi(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
})();
