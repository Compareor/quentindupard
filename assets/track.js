/* ==========================================================
   Analytics — UTM capture + exhaustive event tracking

   Every interaction on the site funnels through track(). Events
   go to /api/track, which aggregates them across all visitors
   for the public stats page.

   Privacy line: an anonymous random id, no IP stored, no third-party
   scripts, and never the CONTENT of anything typed — field lengths
   and interaction counts only. The one exception is the mailbox
   compose form, which is a real contact form and says so.
   ========================================================== */

window.QD = window.QD || {};

(function () {
  'use strict';

  const VISITOR_KEY = 'qd:vid';
  const UTM_KEY = 'qd:utm';
  const SESSION_KEY = 'qd:sid';
  const OPT_OUT_KEY = 'qd:no-personalisation';

  /* Read on every send rather than cached at load, so the switch on /privacy
     takes effect on the next event instead of on the next page load. */
  function optedOut() {
    try { return localStorage.getItem(OPT_OUT_KEY) === '1'; } catch (_) { return false; }
  }

  function randomId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'x' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function stored(store, key) {
    try {
      let v = store.getItem(key);
      if (!v) { v = randomId(); store.setItem(key, v); }
      return v;
    } catch (_) {
      return 'ephemeral';   // private mode — still works, just not sticky
    }
  }

  // Opting out must also stop the ids being MINTED, not just stop them being
  // sent. Writing a fresh qd:vid to the browser of someone who just asked not
  // to be counted would make the switch a lie.
  const visitorId = optedOut() ? 'opted-out' : stored(localStorage, VISITOR_KEY);
  const sessionId = optedOut() ? 'opted-out' : stored(sessionStorage, SESSION_KEY);

  /* ── UTM capture ──────────────────────────────────────── */

  const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

  function captureUtm() {
    if (optedOut()) return {};
    const params = new URLSearchParams(location.search);
    const found = {};
    UTM_FIELDS.forEach((f) => {
      const v = params.get(f);
      if (v) found[f] = v.slice(0, 80);
    });

    // First-touch wins: the campaign that brought someone in keeps credit,
    // not whichever internal link they clicked afterwards.
    try {
      if (Object.keys(found).length) {
        if (!sessionStorage.getItem(UTM_KEY)) sessionStorage.setItem(UTM_KEY, JSON.stringify(found));
        return found;
      }
      const saved = sessionStorage.getItem(UTM_KEY);
      if (saved) return JSON.parse(saved);
    } catch (_) { /* fall through */ }

    if (document.referrer) {
      try {
        const host = new URL(document.referrer).hostname.replace(/^www\./, '');
        if (host && host !== location.hostname) return { utm_source: host, utm_medium: 'referral' };
      } catch (_) { /* ignore */ }
    }
    return { utm_source: 'direct', utm_medium: 'none' };
  }

  const utm = captureUtm();

  /* ── Local mirror, so stats work with no backend ──────── */

  const local = {
    events: 0,
    byName: Object.create(null),
    byTarget: Object.create(null),
    byEventTarget: Object.create(null)   // event -> label -> count, for the funnel
  };

  /* ── Send ─────────────────────────────────────────────────
     Events are BATCHED, not sent one at a time. Workers KV allows
     1,000 writes/day on the free plan and a single visit fires ~30
     events touching several counters each. Sending individually
     burned roughly 200 writes per visitor, which exhausts a day's
     quota in about five visits.

     Batching lets the Worker merge a whole session into one delta
     per counter, so the same visit costs ~20 writes instead of 200.
     ────────────────────────────────────────────────────────── */

  const FLUSH_SIZE = 20;        // send once the buffer reaches this
  const FLUSH_MS = 15000;       // ...or this often, whichever first
  let queue = [];
  let failed = false;
  let probed = false;

  function payload(events) {
    return JSON.stringify({
      events,
      utm,
      path: location.pathname,
      visitor: visitorId,
      session: sessionId,
      ts: Date.now()
    });
  }

  function post(body, useBeacon) {
    // Beacon survives the page closing, which is exactly when the final
    // flush happens. It reports "queued" rather than an HTTP status, so the
    // first send always uses fetch to detect a missing endpoint.
    if (useBeacon && navigator.sendBeacon) {
      if (navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }))) return;
    }
    fetch('/api/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true
    }).then((res) => { if (!res.ok) failed = true; })
      .catch(() => { failed = true; });
  }

  function flush(closing) {
    if (optedOut()) { queue = []; return; }
    if (failed || !queue.length) return;
    const batch = queue;
    queue = [];
    post(payload(batch), probed && closing);
    probed = true;
  }

  function enqueue(event, props) {
    if (failed || optedOut()) return;
    queue.push({ event, props: props || {} });
    if (queue.length >= FLUSH_SIZE) flush(false);
  }

  /* The public entry point. Mirrors into `local` for the no-backend stats
     fallback, queues for the batch, and fires a DOM event so the stats page
     can update live without polling. */
  function track(name, props) {
    const event = String(name || '').slice(0, 60);
    if (!event) return;

    local.events++;
    local.byName[event] = (local.byName[event] || 0) + 1;

    const target = props && props.target;
    if (target) {
      local.byTarget[target] = (local.byTarget[target] || 0) + 1;
      const bucket = local.byEventTarget[event] || (local.byEventTarget[event] = Object.create(null));
      bucket[target] = (bucket[target] || 0) + 1;
    }

    enqueue(event, props);
    document.dispatchEvent(new CustomEvent('qd:track', { detail: { name: event, props } }));
  }

  setInterval(() => flush(false), FLUSH_MS);
  window.addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });

  /* ── Naming every clickable thing ─────────────────────────
     Explicit data-track wins. Otherwise derive something stable
     and human-readable so the stats page is legible without
     needing the source open next to it.
     ────────────────────────────────────────────────────── */

  function slug(text) {
    return String(text || '')
      .trim().toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 40);
  }

  function sectionOf(el) {
    const section = el.closest('section[id], aside[id], .modal, .win');
    if (!section) return 'page';
    if (section.classList.contains('win')) return 'desktop-window';
    if (section.classList.contains('modal')) return 'compose';
    return section.id || 'page';
  }

  function nameFor(el) {
    const marked = el.closest('[data-track]');
    if (marked) return marked.dataset.track;

    const clickable = el.closest('a, button, [role="button"], input, textarea, select, summary');
    if (!clickable) return '';

    if (clickable.tagName === 'A') {
      const href = clickable.getAttribute('href') || '';
      if (/^mailto:/i.test(href)) return 'click_email';
      if (/\.pdf($|\?)/i.test(href)) return 'click_pdf';
      if (/^#/.test(href)) return 'click_anchor';
      if (/^https?:/i.test(href) && !href.includes(location.host)) return 'click_outbound';
      return 'click_link';
    }
    return 'click_button';
  }

  function labelFor(el) {
    const marked = el.closest('[data-track-label]');
    if (marked) return slug(marked.dataset.trackLabel);

    const clickable = el.closest('a, button, [role="button"]') || el;
    const text = (clickable.getAttribute('aria-label') || clickable.textContent || '').trim();
    return slug(text) || slug(clickable.className) || clickable.tagName.toLowerCase();
  }

  /* ── Automatic instrumentation ────────────────────────── */

  function initAuto() {
    track('page_view', { target: slug(document.title) });

    /* Clicks — every one, named. */
    let lastClick = { target: '', at: 0, count: 0 };

    document.addEventListener('click', (e) => {
      const el = e.target;
      if (!(el instanceof Element)) return;

      const name = nameFor(el);
      const target = labelFor(el);
      const section = sectionOf(el);

      if (name) {
        track(name, { target, section });
      } else {
        // A click that hit nothing interactive is still a signal — it usually
        // means something looks clickable but isn't.
        track('click_dead', { target: section, section });
      }

      // Rage clicks: the same thing hit repeatedly in a short window is the
      // clearest "this is broken or too slow" signal you get for free.
      const now = Date.now();
      if (target === lastClick.target && now - lastClick.at < 900) {
        lastClick.count++;
        if (lastClick.count === 3) track('rage_click', { target, section });
      } else {
        lastClick = { target, at: now, count: 1 };
      }
      lastClick.at = now;

      const href = el.closest('a') && el.closest('a').getAttribute('href');
      if (href && /\.pdf($|\?)/i.test(href)) {
        track('download', { target: slug(href.split('/').pop()) });
      }
    });

    /* Which sections actually got seen */
    if ('IntersectionObserver' in window) {
      const seen = new Set();
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.id;
          if (!id || seen.has(id)) return;
          seen.add(id);
          track('section_view', { target: id });
        });
      }, { threshold: 0.35 });
      document.querySelectorAll('section[id]').forEach(s => io.observe(s));
    }

    /* Form interaction — which fields, never their contents */
    document.addEventListener('focusin', (e) => {
      const field = e.target.closest && e.target.closest('input, textarea, select');
      if (!field || field.type === 'hidden') return;
      track('field_focus', { target: slug(field.id || field.name || field.type), section: sectionOf(field) });
    });

    document.addEventListener('submit', (e) => {
      const form = e.target;
      track('form_submit', { target: slug(form.id || 'form'), section: sectionOf(form) });
    }, true);

    /* Copying text is a strong intent signal — someone is taking something away */
    document.addEventListener('copy', () => {
      const length = String(window.getSelection() || '').length;
      track('copy_text', { target: length > 120 ? 'long' : 'short' });
    });

    /* Keyboard shortcuts used */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') track('key_escape', { target: 'escape' });
    });

    /* Scroll depth, once per milestone */
    const marks = [10, 25, 50, 75, 90, 100];
    const hitMarks = new Set();
    let ticking = false;
    let deepest = 0;

    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const doc = document.documentElement;
        const max = doc.scrollHeight - doc.clientHeight;
        const pct = max > 0 ? (doc.scrollTop / max) * 100 : 100;
        deepest = Math.max(deepest, pct);
        marks.forEach((m) => {
          if (pct >= m && !hitMarks.has(m)) { hitMarks.add(m); track('scroll_depth', { target: m + 'pct' }); }
        });
        ticking = false;
      });
    }, { passive: true });

    /* Dwell milestones, foreground time only */
    let visibleMs = 0, last = Date.now();
    const dwellMarks = [10, 30, 60, 150, 300, 600];
    const dwellHit = new Set();

    setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === 'visible') visibleMs += now - last;
      last = now;
      const s = visibleMs / 1000;
      dwellMarks.forEach((m) => {
        if (s >= m && !dwellHit.has(m)) { dwellHit.add(m); track('dwell', { target: m + 's' }); }
      });
    }, 1000);

    document.addEventListener('visibilitychange', () => {
      last = Date.now();
      track(document.visibilityState === 'visible' ? 'tab_visible' : 'tab_hidden', { target: 'tab' });
    });

    /* Session end — one summary event as they leave */
    let ended = false;
    function endSession() {
      if (ended) return;
      ended = true;
      track('session_end', { target: bucket(visibleMs / 1000), depth: Math.round(deepest) });
    }
    window.addEventListener('pagehide', endSession);
    window.addEventListener('beforeunload', endSession);

    /* Anything actually breaking is the most important event on the page */
    window.addEventListener('error', (e) => {
      track('js_error', { target: slug((e.message || 'error').slice(0, 40)) });
    });
  }

  function bucket(seconds) {
    if (seconds < 10) return 'under-10s';
    if (seconds < 30) return '10-30s';
    if (seconds < 60) return '30-60s';
    if (seconds < 180) return '1-3m';
    if (seconds < 600) return '3-10m';
    return 'over-10m';
  }

  window.QD.track = track;
  window.QD.utm = utm;
  window.QD.visitorId = visitorId;
  window.QD.localCounts = local;
  window.QD.slug = slug;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuto);
  } else {
    initAuto();
  }
})();
