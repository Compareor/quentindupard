/* Research pages: scroll rail + reveal, reusing the homepage system. */
(function () {
  'use strict';
  const rail = document.getElementById('rail');
  if (!rail) return;

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      rail.style.transform = `scaleX(${max > 0 ? Math.min(1, doc.scrollTop / max) : 0})`;
      ticking = false;
    });
  }, { passive: true });

  const targets = Array.from(document.querySelectorAll('.reveal'));
  if (!targets.length) return;
  if (!('IntersectionObserver' in window)) {
    targets.forEach(el => el.classList.add('in'));
    return;
  }
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      obs.unobserve(e.target);
    });
  }, { threshold: 0.1 });
  targets.forEach(el => obs.observe(el));
  setTimeout(() => targets.forEach(el => el.classList.add('in')), 2600);
})();

/* ── Contents ─────────────────────────────────────────────────
   Built from the h2s already in the page, which at this point are
   in the visitor's language — so the nav needs no catalogue of its
   own and works on every article ever published without a rebuild.
   Direct children of .prose only: the hub's card titles are h2s
   too, and they are links, not sections.

   It is a <details>: closed by default so it costs one line on a
   phone, forced open on screens wide enough to hold it as a fixed
   panel beside the text. */
(function () {
  'use strict';
  const t = (window.QD && window.QD.t) || ((s) => s);
  const prose = document.querySelector('.prose');
  if (!prose) return;

  const heads = Array.from(prose.querySelectorAll(':scope > h2'));
  if (heads.length < 3) return;   // a contents list of two is noise

  const seen = new Map();
  heads.forEach((h) => {
    if (h.id) return;
    let id = h.textContent.trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
    const n = seen.get(id) || 0;
    seen.set(id, n + 1);
    h.id = n ? `${id}-${n + 1}` : id;
  });

  const nav = document.createElement('details');
  nav.className = 'toc glass';

  const summary = document.createElement('summary');
  summary.textContent = t('On this page');
  nav.appendChild(summary);

  const list = document.createElement('ol');
  heads.forEach((h) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#' + h.id;
    a.textContent = h.textContent;
    a.dataset.track = 'toc_jump';
    a.dataset.trackLabel = h.id;
    li.appendChild(a);
    list.appendChild(li);
  });
  nav.appendChild(list);

  // After the stand-first and the cover, before the first section.
  heads[0].parentNode.insertBefore(nav, heads[0]);

  /* Wide screens hold it open as a sidebar; everywhere else it opens
     when asked. Live, because a rotated tablet crosses the line. */
  const wide = window.matchMedia('(min-width: 1400px)');
  const sync = () => { if (wide.matches) nav.open = true; };
  sync();
  if (wide.addEventListener) wide.addEventListener('change', sync);

  // Jumping from the collapsed list should put the section, not the
  // still-open list, in front of the reader.
  list.addEventListener('click', () => { if (!wide.matches) nav.open = false; });

  /* The reading position follows along: the active section is the
     last h2 above a line a third of the way down the screen.

     Throttled by clock rather than by requestAnimationFrame: rAF stops in
     background tabs, and a page scrolled while hidden (a restored session, a
     window brought back from behind another) would come forward with the
     highlight pointing at wherever it was frozen. */
  const links = new Map(heads.map((h, i) => [h.id, list.children[i].firstChild]));
  let current = null;
  const mark = (id) => {
    let active = id;
    if (active === undefined) {
      const line = window.innerHeight / 3;
      active = null;
      for (const h of heads) {
        if (h.getBoundingClientRect().top <= line) active = h.id; else break;
      }
    }
    if (active === current) return;
    if (current) links.get(current).classList.remove('active');
    if (active) links.get(active).classList.add('active');
    current = active;
  };
  let last = 0;
  window.addEventListener('scroll', () => {
    const now = Date.now();
    if (now - last < 120) return;
    last = now;
    mark();
  }, { passive: true });
  // A click should not wait for the scroll to arrive to say where it is going.
  list.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a) mark(a.hash.slice(1));
  });
  mark();
})();

/* ── Read more ────────────────────────────────────────────────
   The latest pieces from the registry, minus the page you are on.
   Renders on articles, about and privacy; the hub is skipped
   because it IS this list. */
(function () {
  'use strict';
  const t = (window.QD && window.QD.t) || ((s) => s);
  const all = window.QD_ARTICLES;
  if (!Array.isArray(all) || !all.length) return;

  const path = location.pathname;
  if (/\/research\/?$/.test(path)) return;                    // the hub
  const items = all.filter((a) => !path.includes('/research/' + a.slug + '/')).slice(0, 3);
  if (!items.length) return;

  // Same rule the fort uses: runtime links never went through the
  // build's href rewriting, so the locale prefix is added here.
  const lang = document.documentElement.lang;
  const local = (href) => (lang === 'fr' || lang === 'es') ? '/' + lang + href : href;

  const section = document.createElement('section');
  section.className = 'read-more';

  const h = document.createElement('h2');
  h.textContent = t('Read more');
  section.appendChild(h);

  const grid = document.createElement('div');
  grid.className = 'more-grid';
  items.forEach((a) => {
    const card = document.createElement('a');
    card.className = 'glass hub-card more-card';
    card.href = local('/research/' + a.slug + '/');
    card.dataset.track = 'read_more';
    card.dataset.trackLabel = a.slug;

    const thumb = document.createElement('span');
    thumb.className = 'hub-thumb';
    const img = document.createElement('img');
    img.src = a.img;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = 1200; img.height = 630;
    thumb.appendChild(img);

    const kind = document.createElement('span');
    kind.className = 'hub-kind';
    kind.textContent = t(a.kind) + ' · ' + t(a.minutes + ' min read');

    const name = document.createElement('h3');
    name.textContent = t(a.title);

    const go = document.createElement('span');
    go.className = 'hub-go';
    go.textContent = t('Read →');

    card.append(thumb, kind, name, go);
    grid.appendChild(card);
  });
  section.appendChild(grid);

  const cta = document.querySelector('.article-cta');
  if (cta) cta.parentNode.insertBefore(section, cta);
  else {
    const prose = document.querySelector('.prose');
    if (prose) prose.appendChild(section); else return;
  }
})();

/* ── Byline avatar ────────────────────────────────────────────
   A face next to the name, on every page with a byline. Injected
   at runtime for the same reason the contents rail is: the meta
   line is translated markup, and the name is the one part of it
   identical in every language — so matching on it costs no
   catalogue churn and covers future articles automatically. */
(function () {
  'use strict';
  document.querySelectorAll('.article-meta span').forEach((span) => {
    if (span.textContent.trim() !== 'Quentin Dupard') return;
    const img = document.createElement('img');
    img.src = '/assets/portrait/quentin-avatar-96.jpg';
    img.alt = '';
    img.width = 96; img.height = 96;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.className = 'byline-avatar';
    span.insertBefore(img, span.firstChild);
  });
})();
