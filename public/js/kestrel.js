/*! Kestrel analytics · ~2.5 KB · https://github.com/rahulxdevv/kestrel
 *
 *  <script defer data-website-id="SITE_ID" src="https://YOUR-HOST/js/kestrel.js"></script>
 *
 *  Public API:  kestrel('goal', 'signup', { plan: 'pro' })
 *               kestrel('identify', { user_id, email, name })
 *               kestrel('pageview')
 *               kestrel.attribution()  ->  { visitor_id, session_id }
 */
(function () {
  'use strict';

  var win = window;
  var doc = document;
  var loc = win.location;
  var nav = win.navigator;
  var script = doc.currentScript;
  if (!script) return;

  var CONFIG = {
    siteId: script.getAttribute('data-website-id'),
    endpoint: script.getAttribute('data-api') || new URL(script.src).origin + '/api/event',
    allowLocal: script.hasAttribute('data-allow-localhost'),
    cookieDomain: script.getAttribute('data-domain'),
    visitorCookie: 'kt_vid',
    sessionCookie: 'kt_sid',
    ignoreKey: 'kt_ignore',
    visitorMaxAge: 31536000, // 1 year
    sessionIdle: 1800, // 30 minute session, refreshed on every event
    maxEngagedMs: 30 * 60 * 1000,
  };

  var queued = (win.kestrel && win.kestrel.q) || [];

  function noop() {}

  // ---- opt out ------------------------------------------------------------
  // Visiting any page with ?kt_ignore=true sets a permanent local flag; ?kt_ignore=false clears it.
  try {
    var flag = new URLSearchParams(loc.search).get(CONFIG.ignoreKey);
    if (flag === 'true') localStorage.setItem(CONFIG.ignoreKey, '1');
    if (flag === 'false') localStorage.removeItem(CONFIG.ignoreKey);
  } catch (e) {}

  var ignored = false;
  try {
    ignored = localStorage.getItem(CONFIG.ignoreKey) === '1';
  } catch (e) {}

  var localHost = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|.*\.local$)/.test(loc.hostname) || loc.protocol === 'file:';

  if (!CONFIG.siteId || ignored || nav.webdriver || (localHost && !CONFIG.allowLocal)) {
    win.kestrel = noop;
    win.kestrel.q = [];
    win.kestrel.attribution = function () {
      return {};
    };
    return;
  }

  // ---- first-party cookies ------------------------------------------------
  function readCookie(name) {
    var m = doc.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  /** The widest domain that can hold a cookie, so app.example.com and example.com share a visitor. */
  function rootDomain() {
    if (CONFIG.cookieDomain) return CONFIG.cookieDomain;
    var parts = loc.hostname.split('.');
    if (parts.length < 2 || /^\d+$/.test(parts[parts.length - 1])) return null;
    for (var i = parts.length - 2; i >= 0; i--) {
      var candidate = parts.slice(i).join('.');
      doc.cookie = 'kt_t=1; path=/; domain=' + candidate + '; SameSite=Lax';
      if (readCookie('kt_t')) {
        doc.cookie = 'kt_t=; path=/; domain=' + candidate + '; max-age=0';
        return candidate;
      }
    }
    return null;
  }

  var domain = rootDomain();

  function writeCookie(name, value, maxAge) {
    doc.cookie =
      name +
      '=' +
      encodeURIComponent(value) +
      '; path=/; max-age=' +
      maxAge +
      '; SameSite=Lax' +
      (domain ? '; domain=' + domain : '') +
      (loc.protocol === 'https:' ? '; Secure' : '');
  }

  function uuid() {
    if (win.crypto && win.crypto.randomUUID) return win.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
  }

  function ids() {
    var visitorId = readCookie(CONFIG.visitorCookie) || uuid();
    var sessionId = readCookie(CONFIG.sessionCookie) || uuid();
    writeCookie(CONFIG.visitorCookie, visitorId, CONFIG.visitorMaxAge);
    writeCookie(CONFIG.sessionCookie, sessionId, CONFIG.sessionIdle);
    return { vid: visitorId, sid: sessionId };
  }

  // ---- transport ----------------------------------------------------------
  // Anything that looks personal never leaves the browser: emails, tokens and licence keys in a URL
  // are stripped before the event is sent.
  var PRIVATE_PARAM =
    /^(e-?mail|name|phone|password|pass|token|access_token|id_token|auth|code|secret|key|api_key|license_key|license)$/i;

  function cleanUrl(href) {
    try {
      var url = new URL(href);
      var drop = [];
      url.searchParams.forEach(function (_, key) {
        if (PRIVATE_PARAM.test(key)) drop.push(key);
      });
      for (var i = 0; i < drop.length; i++) url.searchParams.delete(drop[i]);
      return url.toString();
    } catch (e) {
      return href;
    }
  }

  function send(type, extra, beacon) {
    var id = ids();
    var body = { w: CONFIG.siteId, t: type, u: cleanUrl(loc.href), vid: id.vid, sid: id.sid, sw: win.screen ? screen.width : 0 };
    for (var key in extra) if (extra[key] !== undefined) body[key] = extra[key];
    var json = JSON.stringify(body);
    // text/plain keeps this a "simple" request: no CORS preflight and sendBeacon-friendly.
    if (beacon && nav.sendBeacon) {
      try {
        if (nav.sendBeacon(CONFIG.endpoint, new Blob([json], { type: 'text/plain' }))) return;
      } catch (e) {}
    }
    try {
      fetch(CONFIG.endpoint, {
        method: 'POST',
        body: json,
        keepalive: true,
        credentials: 'omit',
        headers: { 'Content-Type': 'text/plain' },
      }).catch(noop);
    } catch (e) {}
  }

  // ---- engaged time (counted only while the tab is visible) ---------------
  var visibleSince = doc.visibilityState === 'visible' ? Date.now() : 0;
  var pending = 0;
  var engaged = 0;
  var pageVisibleSince = visibleSince;
  var pageReading = 0;
  var maxScroll = 0;

  function currentScroll() {
    var root = doc.documentElement;
    var max = Math.max(1, root.scrollHeight - win.innerHeight);
    maxScroll = Math.max(maxScroll, Math.min(100, Math.round((win.scrollY / max) * 100)));
  }

  function flushPageEngagement(beacon, pageUrl) {
    if (pageVisibleSince) {
      pageReading += Date.now() - pageVisibleSince;
      pageVisibleSince = doc.visibilityState === 'visible' ? Date.now() : 0;
    }
    if (pageReading > 0 || maxScroll > 0) {
      send('engagement', {
        rt: Math.min(CONFIG.maxEngagedMs, Math.round(pageReading)),
        sd: maxScroll,
        u: pageUrl ? new URL(pageUrl, loc.origin).origin + new URL(pageUrl, loc.origin).pathname : undefined,
      }, beacon);
    }
  }

  function flushTime(beacon) {
    if (visibleSince) {
      pending += Date.now() - visibleSince;
      visibleSince = doc.visibilityState === 'visible' ? Date.now() : 0;
    }
    if (pending >= 1000 && engaged < CONFIG.maxEngagedMs) {
      send('ping', { d: Math.round(pending) }, beacon);
      engaged += pending;
      pending = 0;
    }
  }

  doc.addEventListener('visibilitychange', function () {
    if (doc.visibilityState === 'visible') {
      visibleSince = Date.now();
      pageVisibleSince = Date.now();
    } else {
      flushTime(true);
      flushPageEngagement(true, lastPage);
    }
  });
  win.addEventListener('pagehide', function () {
    flushTime(true);
    flushPageEngagement(true, lastPage);
  });
  win.addEventListener('scroll', currentScroll, { passive: true });
  setInterval(function () {
    if (doc.visibilityState === 'visible') {
      if (engaged < CONFIG.maxEngagedMs) flushTime(false);
      flushPageEngagement(false, lastPage);
    }
  }, 30000);

  // ---- pageviews (including single-page-app navigation) -------------------
  var lastPage = null;
  var firstView = true;

  function pageview() {
    var page = loc.pathname + loc.search;
    if (page === lastPage) return;
    if (lastPage !== null) {
      flushTime(false);
      flushPageEngagement(true, lastPage);
    }
    lastPage = page;
    engaged = 0;
    pageReading = 0;
    maxScroll = 0;
    pageVisibleSince = doc.visibilityState === 'visible' ? Date.now() : 0;
    currentScroll();
    send('pageview', { r: firstView ? doc.referrer : '' });
    firstView = false;
  }

  var history = win.history;
  if (history && history.pushState) {
    ['pushState', 'replaceState'].forEach(function (fn) {
      var original = history[fn];
      history[fn] = function () {
        var result = original.apply(this, arguments);
        setTimeout(pageview, 0);
        return result;
      };
    });
    win.addEventListener('popstate', pageview);
  }

  // ---- goals, outbound links, checkout attribution ------------------------
  function goal(name, props) {
    if (!name) return;
    send('goal', { n: String(name).slice(0, 64), p: props || undefined }, true);
  }

  function attribution() {
    var id = ids();
    return { visitor_id: id.vid, session_id: id.sid };
  }

  /** Dodo checkout links carry the visitor id, so a payment can be credited to the visit that caused it. */
  function tagCheckoutLink(anchor) {
    try {
      var url = new URL(anchor.href);
      if (!/(^|\.)dodopayments\.com$/.test(url.hostname)) return;
      var id = ids();
      url.searchParams.set('metadata_kt_visitor_id', id.vid);
      url.searchParams.set('metadata_kt_session_id', id.sid);
      var next = url.toString();
      if (anchor.href !== next) anchor.href = next;
    } catch (e) {}
  }

  function tagCheckoutLinks() {
    var links = doc.querySelectorAll('a[href*="dodopayments.com"]');
    for (var i = 0; i < links.length; i++) tagCheckoutLink(links[i]);
  }

  // Tag on insert, not only on click, because another script may copy the href and navigate first.
  var tagQueued = false;
  function queueTag() {
    if (tagQueued) return;
    tagQueued = true;
    setTimeout(function () {
      tagQueued = false;
      tagCheckoutLinks();
    }, 50);
  }
  if (win.MutationObserver) {
    new MutationObserver(queueTag).observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href'],
    });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', tagCheckoutLinks);
  else tagCheckoutLinks();

  function onPress(event) {
    var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (anchor) tagCheckoutLink(anchor);
  }
  doc.addEventListener('pointerdown', onPress, true);
  doc.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') onPress(event);
  }, true);

  function onClick(event) {
    var el = event.target && event.target.closest ? event.target : null;
    if (!el) return;

    var goalEl = el.closest('[data-kestrel-goal]');
    if (goalEl) {
      var props = {};
      for (var i = 0; i < goalEl.attributes.length; i++) {
        var attr = goalEl.attributes[i];
        if (attr.name.indexOf('data-kestrel-goal-') === 0) props[attr.name.slice(19)] = attr.value.slice(0, 255);
      }
      goal(goalEl.getAttribute('data-kestrel-goal'), Object.keys(props).length ? props : undefined);
    }

    var anchor = el.closest('a[href]');
    if (!anchor) return;
    tagCheckoutLink(anchor);
    try {
      var url = new URL(anchor.href, loc.href);
      var external = /^https?:$/.test(url.protocol) && url.hostname !== loc.hostname && !(domain && url.hostname.slice(-domain.length) === domain);
      if (external) send('outbound', { n: url.origin + url.pathname }, true);
    } catch (e) {}
  }
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('auxclick', onClick, true);

  // ---- public API ---------------------------------------------------------
  function api(command, a, b) {
    if (command === 'goal' || command === 'track' || command === 'event') goal(a, b);
    else if (command === 'identify' && a) send('identify', { p: { user_id: a.user_id || a.id, email: a.email, name: a.name } });
    else if (command === 'pageview') {
      lastPage = null;
      pageview();
    } else if (command === 'attribution') return attribution();
  }
  api.attribution = attribution;
  api.q = [];
  win.kestrel = api;

  pageview();
  for (var i = 0; i < queued.length; i++) api.apply(null, queued[i]);
})();
