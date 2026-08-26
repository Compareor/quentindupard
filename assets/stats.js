/* ==========================================================
   Live stats page — reads /api/stats and renders it.

   Falls back to this-session-only numbers when the endpoint
   isn't deployed, and says so plainly rather than showing zeros
   that look like "nobody visits this site".
   ========================================================== */

(function () {
  'use strict';

  const $ = s => document.querySelector(s);

  const EVENT_LABELS = {
    page_view: 'Page views',
    session_end: 'Sessions ended',
    section_view: 'Sections reached',
    scroll_depth: 'Scroll milestones',
    dwell: 'Time milestones',
    click_link: 'Link clicks',
    click_button: 'Button clicks',
    click_anchor: 'Jump-link clicks',
    click_outbound: 'Outbound clicks',
    click_email: 'Email clicks',
    click_pdf: 'PDF clicks',
    click_dead: 'Clicks on nothing',
    rage_click: 'Rage clicks',
    download: 'Downloads',
    field_focus: 'Form fields used',
    form_submit: 'Forms submitted',
    copy_text: 'Text copied',
    key_escape: 'Escape pressed',
    tab_hidden: 'Tabbed away',
    tab_visible: 'Came back',
    js_error: 'JavaScript errors',
    ask_submit: 'Asked AI-me',
    chip_click: 'Used a suggestion',
    compose_open: 'Opened compose',
    compose_send: 'Wrote a message',
    compose_delivered: 'Message delivered',
    compose_failed: 'Delivery failed',
    mail_open: 'Opened a message',
    mail_folder: 'Switched folder',
    attachment_download: 'Attachments downloaded',
    folder_open: 'Opened a folder',
    note_open: 'Opened a note',
    desktop_download: 'Desktop downloads',
    desktop_link: 'Desktop links',
    cart_add: 'Added to cart',
    cart_buy: 'Clicked buy',
    dodge: 'Chased the button'
  };

  const SECTION_LABELS = {
    top: 'Hero', thesis: 'Act 01 — The thesis', work: 'Act 02 — What I do',
    pricing: 'Act 03 — Pricing', fort: 'Act 04 — The fort',
    talk: 'Act 05 — Talk', inbox: 'Act 06 — Mailbox', compose: 'Compose'
  };

  function number(n) {
    return (n || 0).toLocaleString('en-US');
  }

  function renderBars(el, rows, labelMap) {
    el.textContent = '';
    if (!rows || !rows.length) {
      const li = document.createElement('li');
      li.className = 'panel-empty';
      li.textContent = 'Nothing recorded yet.';
      el.appendChild(li);
      return;
    }

    const max = Math.max(...rows.map(r => r[1])) || 1;

    rows.slice(0, 8).forEach(([name, count]) => {
      const li = document.createElement('li');
      li.className = 'bar-row';

      const top = document.createElement('div');
      top.className = 'bar-top';
      const label = document.createElement('span');
      label.className = 'bar-name';
      label.textContent = (labelMap && labelMap[name]) || name;
      const val = document.createElement('span');
      val.className = 'bar-val';
      val.textContent = number(count);
      top.append(label, val);

      const track = document.createElement('div');
      track.className = 'bar-track';
      const fill = document.createElement('div');
      fill.className = 'bar-fill';
      fill.style.width = Math.max(2, (count / max) * 100) + '%';
      track.appendChild(fill);

      li.append(top, track);
      el.appendChild(li);
    });
  }

  function renderChart(el, days) {
    el.textContent = '';
    if (!days || !days.length) {
      const p = document.createElement('p');
      p.className = 'panel-empty';
      p.textContent = 'Nothing recorded yet.';
      el.appendChild(p);
      return;
    }

    const max = Math.max(...days.map(d => (d[1] && d[1].views) || 0)) || 1;

    days.forEach(([date, metrics]) => {
      const col = document.createElement('div');
      col.className = 'col';

      const bar = document.createElement('div');
      bar.className = 'col-bar';
      bar.style.height = Math.max(3, ((metrics.views || 0) / max) * 100) + '%';
      bar.title = `${date}: ${number(metrics.views)} views`;

      const label = document.createElement('span');
      label.className = 'col-label';
      label.textContent = date.slice(5);   // MM-DD

      col.append(bar, label);
      el.appendChild(col);
    });
  }

  /* ── Funnel ──────────────────────────────────────────────
     Each step as a share of everyone who landed. Percent-of-landing
     rather than percent-of-previous, because that is the number that
     tells you where the money actually leaks. */
  const FUNNEL = [
    { label: 'Landed',              get: d => total(d, 'page_view') },
    { label: 'Scrolled past hero',  get: d => target(d, 'scroll_depth', '25pct') },
    { label: 'Reached halfway',     get: d => target(d, 'scroll_depth', '50pct') },
    { label: 'Asked AI-me',         get: d => total(d, 'ask_submit') + total(d, 'chip_click') + total(d, 'symptom_pick') },
    { label: 'Opened the pricing',  get: d => target(d, 'section_view', 'pricing') },
    { label: 'Started a message',   get: d => total(d, 'compose_open') },
    { label: 'Sent it',             get: d => total(d, 'compose_send') },
    { label: 'Booked or emailed',   get: d => total(d, 'click_email') + total(d, 'click_outbound') }
  ];

  const total  = (d, ev) => (d.eventMap && d.eventMap[ev]) || 0;
  const target = (d, ev, label) => ((d.byEvent && d.byEvent[ev]) || {})[label] || 0;

  function renderFunnel(el, data) {
    el.textContent = '';
    const base = total(data, 'page_view');
    if (!base) {
      const li = document.createElement('li');
      li.className = 'panel-empty';
      li.textContent = 'Nothing recorded yet.';
      el.appendChild(li);
      return;
    }

    let previous = base;
    FUNNEL.forEach((step, i) => {
      const value = Math.min(step.get(data), base);
      const pct = (value / base) * 100;
      const dropFromPrev = previous > 0 ? ((previous - value) / previous) * 100 : 0;

      const li = document.createElement('li');
      li.className = 'funnel-step';

      const head = document.createElement('div');
      head.className = 'funnel-head';
      const name = document.createElement('span');
      name.className = 'funnel-name';
      name.textContent = step.label;
      const val = document.createElement('span');
      val.className = 'funnel-val';
      val.textContent = `${number(value)} · ${pct.toFixed(1)}%`;
      head.append(name, val);

      const track = document.createElement('div');
      track.className = 'funnel-track';
      const fill = document.createElement('div');
      fill.className = 'funnel-fill';
      fill.style.width = Math.max(0.6, pct) + '%';
      track.appendChild(fill);

      li.append(head, track);

      // Flag the worst single drop so it reads as a to-do, not a chart.
      if (i > 0 && dropFromPrev >= 40 && previous >= 5) {
        const drop = document.createElement('span');
        drop.className = 'funnel-drop';
        drop.textContent = `\u2193 ${dropFromPrev.toFixed(0)}% lost here`;
        li.appendChild(drop);
      }

      el.appendChild(li);
      previous = value || previous;
    });
  }

  /* Distributions rendered as share-of-total rather than raw counts. */
  function renderDistribution(el, map, order, labels) {
    const entries = order
      .filter(k => map && map[k] !== undefined)
      .map(k => [labels[k] || k, map[k]]);
    if (!entries.length) { renderBars(el, []); return; }
    const sum = entries.reduce((a, [, v]) => a + v, 0) || 1;
    renderBars(el, entries.map(([k, v]) => [`${k} — ${Math.round((v / sum) * 100)}%`, v]));
  }

  const SCROLL_ORDER = ['10pct','25pct','50pct','75pct','90pct','100pct'];
  const SCROLL_LABELS = { '10pct':'10%','25pct':'25%','50pct':'50%','75pct':'75%','90pct':'90%','100pct':'To the end' };
  const DWELL_ORDER = ['under-10s','10-30s','30-60s','1-3m','3-10m','over-10m'];
  const DWELL_LABELS = { 'under-10s':'Under 10s','10-30s':'10–30s','30-60s':'30–60s','1-3m':'1–3 min','3-10m':'3–10 min','over-10m':'Over 10 min' };

  const MODE_LABELS = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };

  function renderDemand(data) {
    const views = target(data, 'section_view', 'pricing');
    const adds  = total(data, 'cart_add');
    const buys  = total(data, 'cart_buy');

    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set('#d-views', number(views));
    set('#d-adds',  number(adds));
    set('#d-buys',  number(buys));
    // Share of people who reached the pricing and then actually added something.
    set('#d-rate', views ? Math.round((adds / views) * 100) + '%' : '—');

    const tiers = (data.byEvent || {}).cart_add;
    renderBars($('#tiers'), tiers ? Object.entries(tiers).sort((a, b) => b[1] - a[1]) : []);

    const modes = (data.byEvent || {}).mode_change;
    renderBars($('#modes'), modes ? Object.entries(modes).sort((a, b) => b[1] - a[1]) : [], MODE_LABELS);
  }

  function renderFriction(data) {
    const set = (id, v) => { const e = $(id); if (e) e.textContent = number(v); };
    set('#f-rage', total(data, 'rage_click'));
    set('#f-dead', total(data, 'click_dead'));
    set('#f-err',  total(data, 'js_error'));
    set('#f-bounce', target(data, 'session_end', 'under-10s'));
  }

  function renderSession() {
    const utm = (window.QD && window.QD.utm) || {};
    $('#my-source').textContent = utm.utm_source || 'direct';
    $('#my-campaign').textContent = utm.utm_campaign || 'none';
    $('#my-id').textContent = ((window.QD && window.QD.visitorId) || '—').slice(0, 8) + '…';

    const counts = window.QD && window.QD.localCounts;
    if (counts) $('#my-events').textContent = number(counts.events);
  }

  function showNotice(text) {
    const box = $('#notice');
    $('#notice-text').textContent = text;
    box.hidden = false;
  }

  function localFallback() {
    const counts = (window.QD && window.QD.localCounts) || { events: 0, byName: {} };
    $('#k-visitors').textContent = '1';
    $('#k-views').textContent = number(counts.byName.page_view || 1);
    $('#k-events').textContent = number(counts.events);
    $('#k-downloads').textContent = number(
      (counts.byName.download || 0) + (counts.byName.desktop_download || 0) + (counts.byName.attachment_download || 0)
    );
    const live = $('#k-live'); if (live) live.textContent = '1';

    renderBars($('#events'), Object.entries(counts.byName).sort((a, b) => b[1] - a[1]), EVENT_LABELS);

    // Render the funnel and distributions from this session so the page shows
    // its real shape rather than a column of "no data yet".
    const local = { eventMap: counts.byName, byEvent: counts.byEventTarget || {} };
    renderFunnel($('#funnel'), local);
    renderDistribution($('#scrolldepth'), local.byEvent.scroll_depth, SCROLL_ORDER, SCROLL_LABELS);
    renderDistribution($('#dwell'), local.byEvent.session_end, DWELL_ORDER, DWELL_LABELS);
    renderDemand(local);
    renderFriction(local);

    showNotice(
      'Cumulative stats need the tracking function, which is not deployed on this host yet. ' +
      'The numbers below are your own session only. Once the site is on Cloudflare Pages with a STATS namespace bound, ' +
      'this page shows totals across everyone who has ever visited.'
    );
    $('#updated').textContent = 'session only';
  }

  async function load() {
    try {
      const res = await fetch('/api/stats', { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('stats ' + res.status);
      const data = await res.json();

      if (!data.available) {
        localFallback();
        if (data.reason) showNotice(data.reason + ' Showing your own session instead.');
        return;
      }

      // events arrive sorted as pairs; a map is easier to look up by name
      data.eventMap = Object.fromEntries(data.events || []);
      const totals = data.totals || {};
      $('#k-visitors').textContent = number(totals.visitors);
      $('#k-views').textContent = number(totals.views);
      $('#k-events').textContent = number(totals.events);

      const downloads = (data.events || [])
        .filter(([name]) => /download/.test(name))
        .reduce((sum, [, count]) => sum + count, 0);
      $('#k-downloads').textContent = number(downloads);

      renderChart($('#chart'), data.days);
      renderBars($('#sources'), data.sources);
      renderBars($('#events'), data.events, EVENT_LABELS);
      renderBars($('#files'), data.files);
      renderBars($('#clicks'), data.clicks);
      renderBars($('#sections'), data.sections, SECTION_LABELS);
      renderBars($('#campaigns'), data.campaigns);
      renderFunnel($('#funnel'), data);
      renderDistribution($('#scrolldepth'), (data.byEvent || {}).scroll_depth, SCROLL_ORDER, SCROLL_LABELS);
      renderDistribution($('#dwell'), (data.byEvent || {}).session_end, DWELL_ORDER, DWELL_LABELS);
      renderDemand(data);
      renderFriction(data);
      const live = $('#k-live'); if (live) live.textContent = number(data.liveNow);

      $('#updated').textContent = new Intl.DateTimeFormat([], {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      }).format(new Date(data.generatedAt || Date.now()));

      $('#notice').hidden = true;
    } catch (_) {
      localFallback();
    }
  }

  function boot() {
    renderSession();
    load();
    setInterval(load, 30000);
    document.addEventListener('qd:track', renderSession);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
