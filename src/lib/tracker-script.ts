type TrackerConfig = {
  site: string;
  url: string;
  trackPageviews: boolean;
  trackClicks: boolean;
  trackScroll: boolean;
  trackEvents: boolean;
  trackErrors: boolean;
  customEvents: string[];
};

export function buildTrackerScript(cfg: TrackerConfig): string {
  return `
(function(){
  if (window.__kernTrackerLoaded) return;
  window.__kernTrackerLoaded = true;
  var CFG = ${JSON.stringify(cfg)};
  var lastPath = location.pathname + location.search;
  var maxScrollDepth = 0;

  var queue = [];
  var nextId = 1;
  var FLUSH_MS = 2000;

  function queueEvent(name, props) {
    queue.push({
      id: nextId++,
      name: name,
      path: location.pathname + location.search,
      referrer: document.referrer,
      screenWidth: window.innerWidth,
      properties: props || undefined
    });
  }

  function flushQueue() {
    if (!queue.length) return;
    var batch = queue.slice();
    var sent = {};
    for (var i = 0; i < batch.length; i++) sent[batch[i].id] = true;
    queue = queue.filter(function(e){ return !sent[e.id]; });

    var payload = JSON.stringify({
      site: CFG.site,
      events: batch.map(function(e){
        return {
          name: e.name,
          path: e.path,
          referrer: e.referrer,
          screenWidth: e.screenWidth,
          properties: e.properties
        };
      })
    });
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([payload], { type: 'text/plain' });
        navigator.sendBeacon(CFG.url, blob);
      } else {
        fetch(CFG.url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: payload,
          keepalive: true
        }).catch(function(){});
      }
    } catch (e) {}
  }

  setInterval(flushQueue, FLUSH_MS);
  window.addEventListener('pagehide', flushQueue);
  window.addEventListener('beforeunload', flushQueue);
  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState === 'hidden') flushQueue();
  });

  function pageview() {
    if (!CFG.trackPageviews) return;
    maxScrollDepth = 0;
    queueEvent('pageview');
  }

  if (CFG.trackPageviews) {
    pageview();
    var origPush = history.pushState;
    var origReplace = history.replaceState;
    history.pushState = function(){ origPush.apply(this, arguments); onNav(); };
    history.replaceState = function(){ origReplace.apply(this, arguments); onNav(); };
    window.addEventListener('popstate', onNav);
    function onNav(){
      var p = location.pathname + location.search;
      if (p !== lastPath) { lastPath = p; pageview(); }
    }
  }

  if (CFG.trackClicks) {
    document.addEventListener('click', function(e){
      var doc = document.documentElement;
      var pageW = Math.max(doc.scrollWidth, document.body ? document.body.scrollWidth : 0, window.innerWidth) || 1;
      var pageH = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0, window.innerHeight) || 1;
      var absX = e.clientX + (window.scrollX || window.pageXOffset || 0);
      var absY = e.clientY + (window.scrollY || window.pageYOffset || 0);
      var x = Math.max(0, Math.min(1000, Math.round((absX / pageW) * 1000)));
      var y = Math.max(0, Math.min(1000, Math.round((absY / pageH) * 1000)));
      var trimmed = '';
      var href = '';
      var el = e.target;
      while (el && el !== document.body) {
        var isInteractive = el.tagName === 'A' || el.tagName === 'BUTTON' ||
          el.hasAttribute('data-track') || el.getAttribute('role') === 'button';
        if (isInteractive) {
          var label = el.getAttribute('data-track') || el.textContent || el.tagName;
          trimmed = (label || '').trim().slice(0, 80);
          href = el.href || '';
          break;
        }
        el = el.parentElement;
      }
      queueEvent('click', {
        target: trimmed || undefined,
        href: href || undefined,
        x: x,
        y: y
      });
    }, true);
  }

  if (CFG.trackScroll) {
    window.addEventListener('scroll', function(){
      var doc = document.documentElement;
      var scrolled = (window.scrollY + window.innerHeight) / (doc.scrollHeight || 1);
      var pct = Math.floor(scrolled * 100);
      var newMax = 0;
      if (pct >= 100) newMax = 100;
      else if (pct >= 75) newMax = 75;
      else if (pct >= 50) newMax = 50;
      else if (pct >= 25) newMax = 25;
      if (newMax > maxScrollDepth) {
        maxScrollDepth = newMax;
        queueEvent('scroll', { depth: newMax });
      }
    }, { passive: true });
  }

  if (CFG.trackErrors) {
    window.addEventListener('error', function(e){
      queueEvent('error', {
        message: (e.message || '').slice(0, 200),
        source: (e.filename || '').slice(0, 200),
        line: e.lineno || 0
      });
    });
    window.addEventListener('unhandledrejection', function(e){
      var msg = '';
      try { msg = String(e.reason && (e.reason.message || e.reason)); } catch(_) {}
      queueEvent('error', { message: msg.slice(0, 200), kind: 'unhandledrejection' });
    });
  }

  window.kern = window.kern || {};
  window.kern.event = function(name, props) {
    if (!CFG.trackEvents) return;
    if (CFG.customEvents.indexOf(name) === -1) {
      console.warn('[kern] custom event "' + name + '" is not registered in project settings');
      return;
    }
    queueEvent(name, props);
  };
})();
`.trim();
}
