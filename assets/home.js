/* ==========================================================
   Homepage behaviour

   Story scrolling, dwell-time gags, the pricing cart, the fake
   inbox, and live session stats.

   Two features are edge-backed and both degrade rather than break
   when the function isn't deployed:
     GET  /api/visitor
     POST /api/ask     (streams plain text)
   ========================================================== */

(function () {
  'use strict';

  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* Translation lookup for copy that only exists once JavaScript runs. Page
     copy is swapped at build time instead — see tools/i18n/. */
  const t = (english) => (window.QD && window.QD.t ? window.QD.t(english) : english);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  const OPT_OUT_KEY = 'qd:no-personalisation';
  const optedOut = () => {
    try { return localStorage.getItem(OPT_OUT_KEY) === '1'; } catch (_) { return false; }
  };

  /* ══ 1. Scroll storytelling ═══════════════════════════════ */

  function splitWords(el) {
    let index = 0;

    function walk(node, into) {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) {
              into.appendChild(document.createTextNode(part));
            } else {
              const w = document.createElement('span');
              w.className = 'w';
              w.textContent = part;
              w.style.transitionDelay = (index++ * 26) + 'ms';
              into.appendChild(w);
            }
          });
        } else if (child.nodeName === 'BR') {
          into.appendChild(document.createElement('br'));
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          // Preserve wrappers like <span class="gradient-text"> around words.
          const clone = child.cloneNode(false);
          walk(child, clone);
          into.appendChild(clone);
        }
      });
    }

    const holder = document.createDocumentFragment();
    walk(el, holder);
    el.textContent = '';
    el.appendChild(holder);
  }

  /* Measure each icon path so the draw-on dash matches its real length.
     Hard-coding one value makes short strokes finish early and long ones
     never finish at all. */
  function measureIcons() {
    $$('.ico .dw').forEach((path) => {
      let length = 0;
      try { length = path.getTotalLength(); } catch (_) { /* not rendered yet */ }
      if (length) path.style.setProperty('--len', Math.ceil(length));
    });
  }

  function initReveal() {
    // getTotalLength() forces layout on every icon path; none of them are
    // above the fold, so measuring can wait for an idle moment.
    (window.requestIdleCallback || ((fn) => setTimeout(fn, 300)))(measureIcons);

    // Decorative motion on the hero (gradient drift, glint) starts after
    // load: the first paint stays still, so the LCP entry can settle
    // instead of being repainted from time zero.
    const arm = () => {
      document.documentElement.classList.add('anim-ready');
      const heroTitle = $('.hero-title.glint');
      if (heroTitle) setTimeout(() => heroTitle.classList.add('in'), 240);
    };
    if (document.readyState === 'complete') arm();
    else window.addEventListener('load', arm, { once: true });

    $$('.line-reveal').forEach(splitWords);

    const targets = $$('.reveal');
    if (!targets.length) return;

    if (!('IntersectionObserver' in window)) {
      targets.forEach(el => el.classList.add('in'));
      return;
    }

    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.02, rootMargin: '0px 0px 140px 0px' });

    targets.forEach((el, i) => {
      if (!el.classList.contains('line-reveal')) {
        el.style.transitionDelay = Math.min(i % 3, 2) * 45 + 'ms';
      }
      obs.observe(el);
    });

    // Safety net: observers are throttled in background tabs and can be
    // suppressed by extensions. A missed animation is cosmetic; copy that
    // never becomes visible is a broken page.
    setTimeout(() => {
      targets.forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight * 1.2) el.classList.add('in');
      });
    }, 1400);
  }

  /* ══ 2. Progress rail + live session stats ════════════════ */

  const ACTS = [
    ['#top', 'Hero'], ['#thesis', 'The thesis'], ['#work', 'What I do'],
    ['#pricing', 'Pricing'], ['#fort', 'The fort'], ['#talk', 'Talk'], ['#inbox', 'Inbox']
  ];

  let clicks = 0;
  let visibleMs = 0;
  let lastTick = Date.now();

  function initScrollMeta() {
    const rail = $('#rail');
    const sTime = $('#s-time'), sScroll = $('#s-scroll'), sAct = $('#s-act'), sClicks = $('#s-clicks');

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const doc = document.documentElement;
        const max = doc.scrollHeight - doc.clientHeight;
        const pct = max > 0 ? Math.min(1, doc.scrollTop / max) : 0;
        if (rail) rail.style.transform = `scaleX(${pct})`;
        if (sScroll) sScroll.textContent = Math.round(pct * 100) + '%';

        if (sAct) {
          let current = 'Hero';
          ACTS.forEach(([sel, label]) => {
            const el = $(sel);
            if (el && el.getBoundingClientRect().top <= doc.clientHeight * 0.4) current = label;
          });
          sAct.textContent = current;
        }
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    document.addEventListener('click', () => {
      clicks++;
      if (sClicks) sClicks.textContent = String(clicks);
    });

    // Count only time the tab is actually in front — otherwise a page left
    // open in a background tab would "earn" the dwell gags without anyone
    // reading a word.
    setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === 'visible') visibleMs += now - lastTick;
      lastTick = now;
      if (sTime) sTime.textContent = formatDuration(visibleMs);
      checkDwell(visibleMs);
    }, 1000);
    document.addEventListener('visibilitychange', () => { lastTick = Date.now(); });

    initGlassLevel();
    initTheme();

    const toggle = $('#stats-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const dock = $('#stats');
        const collapsed = dock.classList.toggle('collapsed');
        toggle.setAttribute('aria-expanded', String(!collapsed));
      });
    }
  }

  /* ══ 2b. Liquid Glass transparency ════════════════════════
     iOS 27 exposes this to the user rather than fixing it at design time.
     0 = nearly solid and maximally readable, 100 = maximally transparent.
     Alpha is set from JS because rgba() can't take a variable alpha without
     color-mix, which is newer than the rest of this build assumes. */
  const GLASS_KEY = 'qd:glass';

  function isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  function applyGlassLevel(level) {
    const t = Math.max(0, Math.min(100, level)) / 100;
    const root = document.documentElement.style;

    // Dark glass needs far lower alpha to read as glass at all: white at 0.5
    // over a dark ground is just a grey card. Ranges are per-theme.
    const scale = isDark()
      ? { thin: [0.14, 0.045], regular: [0.19, 0.065], thick: [0.26, 0.10] }
      : { thin: [0.62, 0.30],  regular: [0.72, 0.34],  thick: [0.86, 0.44] };

    const at = ([from, span]) => (from - t * span).toFixed(3);
    root.setProperty('--glass-thin',    `rgba(255,255,255,${at(scale.thin)})`);
    root.setProperty('--glass-regular', `rgba(255,255,255,${at(scale.regular)})`);
    root.setProperty('--glass-thick',   `rgba(255,255,255,${at(scale.thick)})`);
  }

  /* ══ 2c. Light / dark ═════════════════════════════════════ */
  const THEME_KEY = 'qd:theme';

  function initTheme() {
    const btn = $('#theme-toggle');
    const system = window.matchMedia('(prefers-color-scheme: dark)');

    const sync = () => {
      const dark = isDark();
      if (btn) btn.setAttribute('aria-checked', String(dark));
      // Glass alphas are theme-specific, so re-derive them on every switch.
      const slider = $('#glass-level');
      applyGlassLevel(slider ? parseInt(slider.value, 10) : 50);
    };

    sync();

    if (btn) {
      btn.addEventListener('click', () => {
        const next = isDark() ? 'light' : 'dark';
        if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
        else document.documentElement.removeAttribute('data-theme');
        try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* private mode */ }
        sync();
        track('theme_switch', { target: next });
      });
    }

    // Follow the OS only while the visitor has not made their own choice.
    system.addEventListener('change', (e) => {
      let saved = null;
      try { saved = localStorage.getItem(THEME_KEY); } catch (_) { /* ignore */ }
      if (saved) return;
      if (e.matches) document.documentElement.setAttribute('data-theme', 'dark');
      else document.documentElement.removeAttribute('data-theme');
      sync();
    });
  }

  function initGlassLevel() {
    const slider = $('#glass-level');
    if (!slider) return;

    let saved = null;
    try { saved = localStorage.getItem(GLASS_KEY); } catch (_) { /* private mode */ }

    // Someone who has asked their OS to reduce transparency gets the solid end
    // by default, unless they have already chosen otherwise here.
    const reduceTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
    const start = saved !== null ? parseInt(saved, 10) : (reduceTransparency ? 0 : 50);

    slider.value = String(start);
    applyGlassLevel(start);

    slider.addEventListener('input', () => applyGlassLevel(parseInt(slider.value, 10)));
    slider.addEventListener('change', () => {
      try { localStorage.setItem(GLASS_KEY, slider.value); } catch (_) { /* ignore */ }
      track('glass_level', { target: slider.value });
    });
  }

  function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    return m + 'm ' + (s % 60) + 's';
  }

  /* ══ 3. Dwell-time gags ═══════════════════════════════════ */

  const DWELL = [
    {
      at: 60,
      html: '<strong>' + t('Already a minute?') + '</strong> ' + t('At this rate you could have just hired me and skipped the reading.'),
      cta: { label: t('Fine, book it'), href: 'https://calendly.com/quentin-dupard-call/30min' }
    },
    {
      at: 150,
      // Was a joke about entering a card number. It landed as a gag at the
      // reader's expense at the exact moment they are weighing up whether to
      // pay, which is the wrong moment to be clever. Now it just answers the
      // question someone reading this long is probably already asking.
      html: '<strong>' + t('Two and a half minutes.') + '</strong> ' + t('If you are weighing this up, the numbers are all on one page. Three formats, no call needed to see what they cost.'),
      cta: { label: t('See the pricing'), href: '#pricing' }
    },
    {
      at: 300,
      html: '<strong>' + t('Five minutes.') + '</strong> ' + t('I think at this point I am legally your product advisor. Might as well make it official.'),
      cta: { label: t('Make it official'), href: 'https://calendly.com/quentin-dupard-call/30min' }
    },
    {
      at: 600,
      html: '<strong>' + t('Ten minutes.') + '</strong> ' + t('Genuinely — whatever you are stuck on, just send it to me. It will be faster than reading this.'),
      cta: { label: t('Send it over'), href: 'mailto:quentin.dupard@gmail.com' }
    }
  ];

  let dwellFired = 0;

  function checkDwell(ms) {
    const seconds = ms / 1000;
    while (dwellFired < DWELL.length && seconds >= DWELL[dwellFired].at) {
      showToast(DWELL[dwellFired]);
      dwellFired++;
    }
  }

  function showToast({ html, cta }) {
    const dock = $('#toasts');
    if (!dock) return;

    const toast = document.createElement('div');
    toast.className = 'toast';

    const body = document.createElement('div');
    body.innerHTML = html;   // authored above, never user input
    toast.appendChild(body);

    const actions = document.createElement('div');
    actions.className = 'toast-actions';

    if (cta) {
      const link = document.createElement('a');
      link.className = 'btn btn-primary';
      link.href = cta.href;
      link.textContent = cta.label;
      if (/^https?:/.test(cta.href)) { link.target = '_blank'; link.rel = 'noopener'; }
      actions.appendChild(link);
    }

    const dismiss = document.createElement('button');
    dismiss.className = 'btn btn-glass';
    dismiss.type = 'button';
    dismiss.textContent = t('Leave me alone');
    dismiss.addEventListener('click', () => close());
    actions.appendChild(dismiss);

    toast.appendChild(actions);
    dock.appendChild(toast);

    function close() {
      toast.classList.add('out');
      setTimeout(() => toast.remove(), 350);
    }
    setTimeout(close, 14000);
  }

  /* ══ 4. Newsletter opt-in ═════════════════════════════════
     "No thanks" slides away from the pointer. Keyboard and touch users get
     the punchline instead of an unwinnable game — a control that can never
     be activated is a trap, not a joke.
     ────────────────────────────────────────────────────────── */
  function initNewsletter() {
    const ask = $('#news-ask');
    const form = $('#news-form');
    const done = $('#news-done');
    const yes = $('#news-yes');
    const no = $('#news-no');
    if (!ask || !form) return;

    /* ── the evasive No ── */
    let dodges = 0;
    const GIVE_UP_AT = 6;

    function relent() {
      no.style.transform = '';
      no.textContent = t('Fine, I respect it. No hard feelings.');
      no.disabled = true;
      track('newsletter_declined', { target: 'relented' });
    }

    function dodge() {
      if (dodges >= GIVE_UP_AT) { relent(); return; }
      dodges++;
      const x = (Math.random() - 0.5) * 240;
      const y = (Math.random() - 0.5) * 80;
      no.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }

    if (!reduceMotion) {
      no.addEventListener('mouseenter', dodge);
      no.addEventListener('touchstart', (e) => { e.preventDefault(); dodge(); }, { passive: false });
    }
    no.addEventListener('click', relent);
    no.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') relent(); });

    /* ── the Yes ── */
    yes.addEventListener('click', () => {
      ask.hidden = true;
      form.hidden = false;
      $('#news-email').focus();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = $('#news-email').value.trim();
      if (!email) return;

      const submit = $('#news-submit');
      const status = $('#news-status');
      submit.disabled = true;
      submit.textContent = 'Subscribing…';
      status.hidden = true;

      try {
        const res = await fetch('https://formspree.io/f/xeenaboo', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            email,
            _subject: '[quentindupard.com] Newsletter signup',
            message: 'Newsletter subscription request.',
            _gotcha: $('#news-hp').value
          })
        });
        if (!res.ok) throw new Error('formspree ' + res.status);

        form.hidden = true;
        done.hidden = false;
        track('newsletter_subscribed', { target: 'ok' });
      } catch (_) {
        submit.disabled = false;
        submit.textContent = 'Subscribe';
        status.hidden = false;
        status.textContent = t('That did not go through. Email me and I will add you by hand.');
        status.className = 'news-status is-bad';
        track('newsletter_failed', { target: 'error' });
      }
    });
  }

  /* ══ 4b. Carousel ═════════════════════════════════════════
     The track scrolls natively; JS only syncs the dots and arrows to
     wherever the user ended up, so trackpad swipes stay authoritative. */
  function initCarousel() {
    const rail = $('#prev-track');
    if (!rail) return;

    const slides = $$('.done-card', rail);
    const dots = $$('#prev-dots .dot');
    const back = $('#prev-back');
    const next = $('#prev-next');
    if (!slides.length) return;

    const step = () => (slides[1] ? slides[1].offsetLeft - slides[0].offsetLeft : slides[0].offsetWidth);
    const maxScroll = () => rail.scrollWidth - rail.clientWidth;

    /* A trailing spacer in the track lets the last card reach the left edge,
       so every card is its own stop and the dots map 1:1 to the slides. */
    const stops = () => slides.length;

    function current() {
      const s = step() || 1;
      return Math.min(stops() - 1, Math.round(rail.scrollLeft / s));
    }

    function sync() {
      const i = current();
      const n = stops();
      dots.forEach((d, k) => {
        d.hidden = k >= n;
        d.classList.toggle('is-active', k === i);
      });
    }

    /* Wraps rather than stopping: past the last slide it returns to the first,
       and back from the first jumps to the end. The arrows are never dead. */
    function go(i) {
      const n = stops();
      const wrapped = ((i % n) + n) % n;
      rail.scrollLeft = Math.min(maxScroll(), wrapped * step());
      sync();
    }

    if (back) back.addEventListener('click', () => { go(current() - 1); track('carousel_prev'); });
    if (next) next.addEventListener('click', () => { go(current() + 1); track('carousel_next'); });
    dots.forEach(d => d.addEventListener('click', () => go(parseInt(d.dataset.go, 10))));

    rail.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(current() + 1); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); go(current() - 1); }
    });

    /* Time-throttled rather than rAF-throttled: rAF does not run in a hidden
       or backgrounded tab, which would leave the dots stale on return. */
    let last = 0, timer = null;
    rail.addEventListener('scroll', () => {
      const now = Date.now();
      clearTimeout(timer);
      if (now - last > 80) { last = now; sync(); }
      timer = setTimeout(sync, 120);
    }, { passive: true });

    window.addEventListener('resize', sync);
    sync();
  }

  /* ══ 5. Delivery mode + cart ══════════════════════════════ */

  /* Uplift is a multiplier on the base rate. On-site also carries travel at
     cost, which is stated rather than baked in — nobody can quote that blind.
     TODO(Quentin): set these to your real numbers. */
  const MODES = {
    remote: {
      uplift: 1,
      note: 'Remote by default. Everything happens over video and inside your tools, which is how most of this work gets done anyway.'
    },
    hybrid: {
      uplift: 1.25,
      note: 'Mostly remote, with days on-site at the moments that need a room — kickoff, the pricing argument, the readout. Travel billed at cost.'
    },
    onsite: {
      uplift: 1.6,
      note: 'I am with your team in person for the engagement. Costs more because it eats the days either side too. Travel and accommodation at cost, agreed up front.'
    }
  };

  let mode = 'remote';

  function priceFor(base) {
    const raw = base * MODES[mode].uplift;
    // Round to the nearest 50 so the uplift never produces a number that looks
    // like it came out of a spreadsheet by accident.
    return Math.round(raw / 50) * 50;
  }

  function money(value) {
    return '€' + value.toLocaleString('en-US');
  }

  function initModes() {
    const buttons = $$('.mode');
    if (!buttons.length) return;

    function paint() {
      $$('.tier-price').forEach((el) => {
        // Free and Custom carry no base rate; delivery mode does not apply.
        if (el.hasAttribute('data-fixed')) return;
        const base = parseInt(el.dataset.base, 10);
        const amount = el.querySelector('.tier-amount');
        if (amount) amount.textContent = money(priceFor(base));
      });

      $$('.tier-add').forEach((btn) => {
        btn.dataset.price = String(priceFor(parseInt(btn.dataset.base || btn.dataset.price, 10)));
      });

      /* Espresso is ninety minutes. Travelling for it makes no sense for
         either side, so it is offered remote only rather than quietly priced
         at a number nobody should pay. */
      $$('[data-remote-only]').forEach((tier) => {
        const available = mode === 'remote';
        tier.classList.toggle('is-unavailable', !available);
        const btn = tier.querySelector('.tier-add');
        const why = tier.querySelector('.tier-unavailable');
        if (btn) {
          btn.disabled = !available;
          btn.setAttribute('aria-disabled', String(!available));
        }
        if (why) why.hidden = available;
      });

      const note = $('#mode-note');
      if (note) note.textContent = MODES[mode].note;
    }

    // Remember the base rate before any uplift overwrites it.
    $$('.tier-add').forEach(btn => { btn.dataset.base = btn.dataset.price; });

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        mode = btn.dataset.mode;
        buttons.forEach((b) => {
          const active = b === btn;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-checked', String(active));
        });
        paint();
        document.dispatchEvent(new CustomEvent('qd:mode'));
        track('mode_change', { target: mode });
      });
    });

    paint();
  }

  function initCart() {
    const dock  = $('#cart-dock');
    const items = $('#cart-items');
    const meta  = $('#cart-meta');
    const count = $('#cart-count');
    const buy   = $('#cart-buy');
    const clear = $('#cart-clear');
    if (!dock) return;

    const cart = new Map();

    function setButton(btn, inCart) {
      btn.classList.toggle('added', inCart);
      btn.textContent = inCart ? t('In cart ✓') : t('Add to cart');
    }

    $$('.tier-add').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tier = btn.dataset.tier;
        const price = parseInt(btn.dataset.base || btn.dataset.price, 10);

        if (cart.has(tier)) {
          cart.delete(tier);
          setButton(btn, false);
        } else {
          cart.set(tier, price);
          setButton(btn, true);
          track('cart_add', { tier: tier });
          /* The whole point of moving the basket: something has to happen at
             the moment of the click. The dock is fixed, so it is on screen
             wherever the reader is, and it flashes once on arrival. */
          dock.classList.remove('bump');
          void dock.offsetWidth;            // restart the animation
          dock.classList.add('bump');
        }
        render();
      });
    });

    function render() {
      const open = cart.size > 0;
      dock.hidden = !open;
      document.documentElement.classList.toggle('has-cart', open);
      if (!open) return;

      const total = Array.from(cart.keys())
        .reduce((sum, tier) => sum + priceFor(cart.get(tier)), 0);
      count.textContent = String(cart.size);
      items.textContent = Array.from(cart.keys()).join(' + ');
      meta.textContent = `${money(total)} · ${mode}`;
    }

    // A mode switch changes the price of a basket already on screen — and can
    // withdraw an engagement entirely. Anything the new mode does not offer
    // comes out of the basket first, or the total would include something
    // that cannot be bought.
    document.addEventListener('qd:mode', () => {
      $$('[data-remote-only] .tier-add').forEach((btn) => {
        if (mode !== 'remote' && cart.has(btn.dataset.tier)) {
          cart.delete(btn.dataset.tier);
          setButton(btn, false);
          track('cart_remove', { target: btn.dataset.tier });
        }
      });
      render();
    });

    if (clear) {
      clear.addEventListener('click', () => {
        cart.clear();
        $$('.tier-add').forEach(b => setButton(b, false));
        track('cart_remove', { target: 'all' });
        render();
      });
    }

    if (buy) {
      buy.addEventListener('click', () => {
        // No fake checkout. The honest end of this joke is a real conversation.
        const names = Array.from(cart.keys()).join(' + ');
        track('cart_buy', { tiers: names });
        showToast({
          html: `<strong>${t('Good choice.')}</strong> ` +
                t('There is no card form here. {what} starts with a conversation, so let us just have it.')
                  .replace('{what}', names || 'this'),
          cta: { label: t('Book the call'), href: 'https://calendly.com/quentin-dupard-call/30min' }
        });
      });
    }
  }

  const track = (name, props) => {
    if (window.QD && window.QD.track) window.QD.track(name, props);
  };

  /* ══ 6. Mail client ═══════════════════════════════════════ */

  const SENT_KEY = 'qd:sent';

  function loadSent() {
    try { return JSON.parse(localStorage.getItem(SENT_KEY) || '[]'); }
    catch (_) { return []; }
  }
  function saveSent(list) {
    try { localStorage.setItem(SENT_KEY, JSON.stringify(list.slice(-25))); }
    catch (_) { /* private mode — it just won't persist across reloads */ }
  }


  /* ══ Edited content overlay ═══════════════════════════════ */

  /* Folder items come from content.js at runtime, so the build step that
     rewrites every href into /fr/... or /es/... never sees them. Without this
     a French visitor opening the fort got sent to the English article.

     Assets are excluded: /assets/docs/x.pdf exists once, not once per
     language, and prefixing it would 404. */
  function localHref(href) {
    if (typeof href !== 'string' || !href.startsWith('/')) return href;   // external or missing
    if (/^\/(assets|api)\//.test(href)) return href;                      // one copy, all locales
    // Strip any locale already on the path before adding this one, so an href
    // written as /fr/... does not become /es/fr/... on the Spanish site.
    const bare = href.replace(/^\/(fr|es)(?=\/|$)/, '') || '/';
    const lang = document.documentElement.lang;
    return (lang === 'fr' || lang === 'es') ? '/' + lang + bare : bare;
  }

  /* The store is an overlay on the shipped file, not a replacement for it.
     Precedence is per folder: one the admin has actually put something into
     wins, one left empty falls back to whatever shipped in content.js.

     Replacing the whole array is what hid two published articles. The store
     had been saved while every folder was empty, and from then on it shadowed
     each later change to the file — the code said Research had two items, the
     site said Research was empty, and both were reading their own truth. */
  function mergeDesktop(file, stored) {
    const byId = new Map(stored.map((f) => [f.id, f]));
    const merged = file.map((f) => {
      const s = byId.get(f.id);
      if (!s) return f;                       // never touched in /admin
      byId.delete(f.id);
      const items = Array.isArray(s.items) ? s.items : [];
      // Keep any rename made in /admin; restore the file's contents.
      return items.length ? s : Object.assign({}, s, { items: f.items || [] });
    });
    // Folders created in /admin that do not exist in the file at all.
    // Only with items: an empty stored folder is either unfinished or a
    // leftover of one deleted from the file, and neither should render.
    return merged.concat(Array.from(byId.values())
      .filter((f) => Array.isArray(f.items) && f.items.length));
  }

  async function loadContent() {
    // The fort and the inbox do not render until this settles, so it must not
    // be able to hang. A slow edge is not a reason for an empty section.
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), 2500);
    try {
      const res = await fetch('/api/content', {
        headers: { accept: 'application/json' },
        signal: stop.signal
      });
      if (res.status === 204 || !res.ok) return;          // nothing edited yet
      const store = await res.json();
      if (Array.isArray(store.desktop) && store.desktop.length) {
        window.QD_DESKTOP = mergeDesktop(window.QD_DESKTOP || [], store.desktop);
      }
      if (Array.isArray(store.mailbox) && store.mailbox.length) window.QD_MAILBOX = store.mailbox;
    } catch (_) {
      // Offline, blocked, slow, or the route is not deployed. Defaults stand.
    } finally {
      clearTimeout(timer);
    }
  }

  function initMail() {
    const root = $('#mail');
    const list = $('#mail-list');
    const read = $('#mail-read');
    if (!root || !list || !read) return;

    const inbox = (window.QD_MAILBOX || []).map(m => Object.assign({ folder: 'inbox' }, m));
    let sent = loadSent();
    let folder = 'inbox';
    let openId = null;
    const readIds = new Set();

    function messages() {
      return folder === 'inbox' ? inbox : sent;
    }

    function counts() {
      const unread = inbox.filter(m => !readIds.has(m.id)).length;
      $('#mail-unread').textContent = String(unread);
      $('#mail-sent-count').textContent = String(sent.length);
    }

    function renderList() {
      list.textContent = '';
      const items = messages();

      if (!items.length) {
        const li = document.createElement('li');
        li.className = 'mail-empty';
        li.style.padding = '20px 15px';
        li.textContent = folder === 'sent'
          ? 'Nothing sent yet. Hit “New message”.'
          : 'Empty.';
        list.appendChild(li);
        return;
      }

      items.forEach((m) => {
        const li = document.createElement('li');
        li.className = 'mail-item' + (readIds.has(m.id) ? ' read' : '') + (m.id === openId ? ' is-open' : '');
        // A native button inside a plain <li>: the list keeps its semantics
        // for screen readers, the button brings focus and Enter/Space for free.
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mail-item-btn';
        li.appendChild(btn);

        const top = document.createElement('div');
        top.className = 'mail-item-top';
        const from = document.createElement('span');
        from.className = 'mail-item-from';
        from.textContent = m.from;
        const time = document.createElement('span');
        time.className = 'mail-item-time';
        time.textContent = t(m.time);
        top.append(from, time);
        if (m.folder !== 'sent' && !m.real) {
          const demo = document.createElement('span');
          demo.className = 'mail-item-demo';
          demo.textContent = t('Demo');
          from.appendChild(demo);
        }

        const subject = document.createElement('div');
        subject.className = 'mail-item-subject';
        subject.textContent = t(m.subject);

        btn.append(top, subject);

        if (m.attach && m.attach.length) {
          const clip = document.createElement('div');
          clip.className = 'mail-item-clip';
          // Two forms rather than an 's' glued on: French and Spanish do not
          // pluralise by suffixing the English word.
          const n = m.attach.length;
          clip.textContent = '📎 ' + t(n > 1 ? '{n} attachments' : '{n} attachment').replace('{n}', n);
          btn.appendChild(clip);
        }

        btn.addEventListener('click', () => openMessage(m));

        list.appendChild(li);
      });
    }

    function openMessage(m) {
      openId = m.id;
      readIds.add(m.id);
      root.classList.add('reading');
      read.textContent = '';

      // Mobile collapses to one pane, so the reading view needs a way back.
      const back = document.createElement('button');
      back.className = 'inbox-back mail-back';
      back.type = 'button';
      back.textContent = t('← All messages');
      back.style.cssText = 'font:inherit;font-size:13px;color:var(--cyan);background:none;border:none;padding:0;margin-bottom:14px;cursor:pointer;';
      back.addEventListener('click', () => {
        root.classList.remove('reading');
        openId = null;
        renderList();
        read.textContent = '';
        const empty = document.createElement('p');
        empty.className = 'mail-empty';
        empty.textContent = t('Select a message to read it.');
        read.appendChild(empty);
      });
      read.appendChild(back);

      const head = document.createElement('div');
      head.className = 'mail-read-head';

      const subj = document.createElement('p');
      subj.className = 'mail-read-subject';
      subj.textContent = t(m.subject);

      const fromLine = document.createElement('p');
      fromLine.className = 'mail-read-from';
      fromLine.textContent = m.from;

      const meta = document.createElement('p');
      meta.className = 'mail-read-meta';
      meta.textContent = [m.role && t(m.role), m.email].filter(Boolean).join(' · ');

      head.append(subj, fromLine, meta);
      if (folder !== 'sent' && !m.real) {
        const note = document.createElement('p');
        note.className = 'mail-read-demo';
        note.textContent = t('Demo message: written to show the format, not a real client.');
        head.appendChild(note);
      }
      read.appendChild(head);

      const body = document.createElement('div');
      body.className = 'mail-read-body';
      (m.body || []).forEach((para) => {
        const p = document.createElement('p');
        p.textContent = t(para);   // text node — never innerHTML for stored content
        body.appendChild(p);
      });
      read.appendChild(body);

      (m.attach || []).forEach((a) => {
        const link = document.createElement('a');
        link.className = 'mail-attach';
        link.href = a.href;
        link.setAttribute('download', '');
        link.dataset.track = 'attachment_download';
        link.dataset.trackLabel = a.name;

        const icon = document.createElement('span');
        icon.textContent = '📄';
        const name = document.createElement('span');
        name.className = 'mail-attach-name';
        name.textContent = a.name;
        const size = document.createElement('span');
        size.className = 'mail-attach-size';
        size.textContent = a.size || '';

        link.append(icon, name, size);
        read.appendChild(link);
      });

      counts();
      renderList();
      track('mail_open', { id: m.id, folder });
    }

    $$('.mail-folder').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.mail-folder').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        folder = btn.dataset.folder;
        openId = null;
        root.classList.remove('reading');
        renderList();
        track('mail_folder', { folder });
      });
    });

    /* ── Compose ── */
    const modal = $('#compose');
    const form = $('#compose-form');

    let composeOpenedAt = 0;

    function openCompose() {
      modal.hidden = false;
      composeOpenedAt = Date.now();
      setStatus('');
      $('#compose-from').focus();
    }
    function closeCompose() { modal.hidden = true; }

    function setStatus(text, tone) {
      const el = $('#compose-status');
      if (!text) { el.hidden = true; el.textContent = ''; return; }
      el.hidden = false;
      el.textContent = text;
      el.className = 'compose-status' + (tone ? ' is-' + tone : '');
    }

    $('#mail-new').addEventListener('click', openCompose);
    $$('[data-close-compose]').forEach(el => el.addEventListener('click', closeCompose));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) closeCompose();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const from = $('#compose-from').value.trim();
      const subject = $('#compose-subject').value.trim();
      const bodyText = $('#compose-body').value.trim();
      if (!from || !subject || !bodyText) return;

      const submit = $('#compose-submit');
      const label = $('#compose-submit-label');
      submit.disabled = true;
      label.textContent = 'Sending…';
      setStatus('');

      let delivered = false;
      let note = '';

      /* Formspree rather than the edge function: it works on any host, so the
         form is live today instead of waiting on the Cloudflare migration, and
         there is no API key to leak. Same endpoint the old site used. */
      try {
        const res = await fetch('https://formspree.io/f/xeenaboo', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            email: from,
            _subject: `[quentindupard.com] ${subject}`,
            message: bodyText,
            _gotcha: $('#compose-company').value      // Formspree's own honeypot
          })
        });

        if (res.ok) {
          delivered = true;
        } else {
          const data = await res.json().catch(() => ({}));
          note = (data.errors && data.errors[0] && data.errors[0].message) || 'The form service rejected it.';
          submit.disabled = false;
          label.textContent = 'Send';
          setStatus(note + ' Try again, or email me directly.', 'bad');
          track('compose_failed', { target: String(res.status) });
          return;
        }
      } catch (_) {
        note = 'No connection, so this was not delivered.';
      }

      submit.disabled = false;
      label.textContent = 'Send';
      track(delivered ? 'compose_delivered' : 'compose_failed', { target: delivered ? 'ok' : 'fallback' });

      const message = {
        id: 'sent-' + Date.now(),
        from: 'You',
        email: from,
        role: 'Sent from quentindupard.com',
        subject,
        time: new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(new Date()),
        body: bodyText.split(/\n{2,}/).filter(Boolean),
        folder: 'sent'
      };

      sent = sent.concat([message]);
      saveSent(sent);

      // Analytics records that a send happened and nothing about its contents.
      track('compose_send', { target: delivered ? 'delivered' : 'local_only' });

      form.reset();
      closeCompose();

      $$('.mail-folder').forEach(b => b.classList.toggle('is-active', b.dataset.folder === 'sent'));
      folder = 'sent';
      counts();
      renderList();
      openMessage(message);
      $('#mail').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });

      if (delivered) {
        showToast({
          html: '<strong>That reached me.</strong> It is in my inbox and I reply to everything, usually same day. Your copy is in Sent.'
        });
      } else {
        // Delivery failed or is not configured. Never pretend it worked — hand
        // over a prefilled mailto so the message still has somewhere to go.
        const mailto = 'mailto:quentin.dupard@gmail.com'
          + '?subject=' + encodeURIComponent(subject)
          + '&body=' + encodeURIComponent(bodyText + '\n\n— ' + from);

        showToast({
          html: '<strong>Saved to Sent, but not delivered.</strong> '
              + (note ? note + ' ' : '')
              + 'Send it properly and it will actually reach me.',
          cta: { label: t('Send it for real'), href: mailto }
        });
      }
    });

    counts();
    renderList();
  }

  /* ══ 6b. The fort — a Mac desktop ═════════════════════════ */

  const FOLDER_SVG = `<svg class="folder-icon" viewBox="0 0 64 50" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M2 10a5 5 0 0 1 5-5h17l6 7h27a5 5 0 0 1 5 5v28a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V10Z" fill="#4a7fd4"/>
    <path d="M2 18h60v25a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V18Z" fill="#6ba3ec"/>
  </svg>`;

  function initMac() {
    const desk = $('#mac-desk');
    const layer = $('#mac-windows');
    if (!desk || !layer) return;

    const clock = $('#mac-clock');
    if (clock) {
      const tick = () => {
        clock.textContent = new Intl.DateTimeFormat([], {
          weekday: 'short', hour: '2-digit', minute: '2-digit'
        }).format(new Date());
      };
      tick();
      setInterval(tick, 30000);
    }

    let z = 121;

    (window.QD_DESKTOP || []).forEach((folderData) => {
      const btn = document.createElement('button');
      btn.className = 'folder';
      btn.type = 'button';
      btn.innerHTML = FOLDER_SVG;   // authored constant, not user input

      const name = document.createElement('span');
      name.className = 'folder-name';
      name.textContent = t(folderData.name);
      btn.appendChild(name);

      const open = () => openFolder(folderData);
      // Double-click is the Mac idiom; a single tap is the only sane one on
      // touch, where there is no hover to signal affordance.
      btn.addEventListener('dblclick', open);
      btn.addEventListener('click', () => { if (isTouch) open(); });
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });

      desk.appendChild(btn);
    });

    function makeWindow(title) {
      const win = document.createElement('div');
      win.className = 'win';
      win.style.zIndex = String(++z);

      const rect = desk.getBoundingClientRect();
      const width = Math.min(520, window.innerWidth - 32);
      const left = Math.max(16, rect.left + 40 + (z % 4) * 26);
      const top = Math.max(80, rect.top + 50 + (z % 4) * 24);
      win.style.left = Math.min(left, window.innerWidth - width - 16) + 'px';
      // The window is fixed-positioned, so `top` is measured against the viewport.
      // Opening a folder while the desk sits low on screen would otherwise put the
      // window mostly below the fold. Clamp it so it always lands somewhere visible.
      win.style.top = Math.min(top, Math.max(80, window.innerHeight - 320)) + 'px';

      const bar = document.createElement('div');
      bar.className = 'win-bar';

      const close = document.createElement('button');
      close.className = 'win-close';
      close.type = 'button';
      close.setAttribute('aria-label', 'Close ' + title);
      close.addEventListener('click', () => win.remove());

      const heading = document.createElement('span');
      heading.className = 'win-title';
      heading.textContent = title;

      bar.append(close, heading);
      win.appendChild(bar);

      // Drag by the title bar, pointer events so it works with touch too.
      bar.addEventListener('pointerdown', (e) => {
        if (e.target === close) return;
        // Dragging fights page scroll on touch; windows stay put there.
        if (isTouch) return;
        const startX = e.clientX, startY = e.clientY;
        const originLeft = parseFloat(win.style.left), originTop = parseFloat(win.style.top);
        win.style.zIndex = String(++z);
        bar.setPointerCapture(e.pointerId);

        const move = (ev) => {
          win.style.left = Math.max(4, Math.min(window.innerWidth - 60, originLeft + ev.clientX - startX)) + 'px';
          win.style.top  = Math.max(4, Math.min(window.innerHeight - 40, originTop + ev.clientY - startY)) + 'px';
        };
        const up = () => {
          bar.removeEventListener('pointermove', move);
          bar.removeEventListener('pointerup', up);
        };
        bar.addEventListener('pointermove', move);
        bar.addEventListener('pointerup', up);
      });

      layer.appendChild(win);
      return win;
    }

    function openFolder(data) {
      const win = makeWindow(t(data.name));
      const body = document.createElement('div');
      body.className = 'win-body';

      /* A video row is hidden until its file actually exists. The entry can
         then be committed ahead of the MP4 without showing a dead player. */
      const items = (data.items || []).filter(i => !(i.kind === 'video' && i.missing));

      const count = document.createElement('span');
      count.className = 'win-count';
      count.textContent = items.length === 1 ? t('1 item')
                                             : t('{n} items').replace('{n}', items.length);
      win.querySelector('.win-bar').appendChild(count);

      items.forEach((item) => {
        let node;

        if (item.kind === 'note' || item.kind === 'video') {
          node = document.createElement('button');
          node.type = 'button';
          node.addEventListener('click',
            () => (item.kind === 'video' ? openVideo(item) : openNote(item)));
        } else {
          node = document.createElement('a');
          node.href = localHref(item.href);
          if (item.kind === 'pdf') {
            node.setAttribute('download', '');
            node.dataset.track = 'desktop_download';
          } else if (item.kind === 'page') {
            // Same-site research. Opens in this tab like any other page.
            node.dataset.track = 'desktop_page';
          } else {
            node.target = '_blank';
            node.rel = 'noopener';
            node.dataset.track = 'desktop_link';
          }
          node.dataset.trackLabel = item.name;
        }

        node.className = 'file';

        const icon = document.createElement('span');
        icon.className = 'file-icon';
        icon.textContent =
          item.kind === 'pdf'   ? '📄' :
          item.kind === 'video' ? '🎬' :
          item.kind === 'note'  ? '📝' :
          item.kind === 'page' ? '📰' : '🔗';

        const label = document.createElement('span');
        label.className = 'file-name';
        label.textContent = t(item.name);

        const meta = document.createElement('span');
        meta.className = 'file-meta';
        meta.textContent = item.meta ? t(item.meta) : '';

        node.append(icon, label);
        /* A folder that mixes books, articles and files needs the row to say
           which is which. Optional, translated, and after the name so a long
           title still gets the room. */
        if (item.tag) {
          const tag = document.createElement('span');
          tag.className = 'file-tag';
          tag.textContent = t(item.tag);
          node.appendChild(tag);
        }
        node.appendChild(meta);
        body.appendChild(node);
      });

      win.appendChild(body);
      track('folder_open', { folder: data.name });
    }

    function openNote(item) {
      const win = makeWindow(item.name);
      const body = document.createElement('div');
      body.className = 'win-note';
      (item.body || []).forEach((para) => {
        const p = document.createElement('p');
        p.textContent = para;
        body.appendChild(p);
      });
      win.appendChild(body);
      track('note_open', { note: item.name });
    }
  }

  /* ══ 7. Visitor resolution ════════════════════════════════ */

  const ISP_PATTERN = /\b(telecom|telecoms|broadband|mobile|wireless|cable|isp|communications?|internet|fiber|fibre|hosting|cloud|vpn|proxy|comcast|verizon|at&t|orange|vodafone|bouygues|free\s?sas|sfr|deutsche telekom|bt group|virgin media|charter|spectrum|cox|starlink|t-mobile)\b/i;
  const looksLikeEmployer = (org) => !!org && org.length > 2 && !ISP_PATTERN.test(org);

  async function initVisitor() {
    if (optedOut()) return;

    let data = null;
    try {
      // The country name comes back localised, so the endpoint has to be told
      // which language the page is in — it cannot infer it from Accept-Language
      // when the visitor is reading a translation their browser did not ask for.
      const lang = (document.documentElement.getAttribute('lang') || 'en').slice(0, 2);
      const res = await fetch('/api/visitor?lang=' + encodeURIComponent(lang),
                              { headers: { accept: 'application/json' } });
      if (res.ok) data = await res.json();
    } catch (_) { /* no edge function — keep the default eyebrow */ }
    if (!data) return;

    const line = $('#visitor-line');
    const text = $('#visitor-text');
    if (!line || !text) return;

    /* Returning visitors get a different opener. The flag is separate from
       the analytics id so clearing one does not silently change the other. */
    const SEEN_KEY = 'qd:seen';
    let returning = false;
    try {
      returning = localStorage.getItem(SEEN_KEY) === '1';
      localStorage.setItem(SEEN_KEY, '1');
    } catch (_) { /* private mode — treat as a first visit */ }

    const city = data.city || data.country || '';
    let greeting = '';

    /* Built from a template rather than concatenated, because the place a
       city name sits in the sentence is not the same in every language. */
    if (city) {
      greeting = t(returning
        ? 'Welcome back. Still need me in {city}?'
        : 'Welcome. Do you need me in {city}?').replace('{city}', city);
    } else if (returning) {
      greeting = t('Welcome back.');
    }
    if (!greeting) return;

    line.classList.add('swapping');
    setTimeout(() => {
      text.textContent = greeting;
      line.classList.remove('swapping');
    }, 260);
  }

  /* ══ 8. Ask — "tell me your business" ═════════════════════ */

  const ask   = $('#ask');
  const form  = $('#ask-form');
  const input = $('#ask-input');
  const chat  = $('#chat');

  /* Append a message to the open transcript. Returns the body element so a
     streaming reply can keep writing into it. */
  function addMessage(who, text) {
    const msg = document.createElement('div');
    msg.className = who === 'you' ? 'msg msg-you' : 'msg msg-ai';

    const label = document.createElement('span');
    label.className = 'msg-who';
    label.textContent = who === 'you' ? 'You' : 'AI-me';
    msg.appendChild(label);

    const body = document.createElement('div');
    msg.appendChild(body);

    if (text) {
      const p = document.createElement('p');
      p.textContent = text;
      body.appendChild(p);
    }

    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
    return { msg, body };
  }

  /* Deliberately boring markdown — paragraphs, bullets, **bold** — built as
     DOM nodes rather than innerHTML so a model response cannot inject markup. */
  function renderMarkdown(container, text) {
    container.textContent = '';
    text.split(/\n{2,}/).forEach((block) => {
      const lines = block.split('\n').filter(l => l.trim());
      if (!lines.length) return;

      if (lines.every(l => /^\s*[-*•]\s+/.test(l))) {
        const ul = document.createElement('ul');
        lines.forEach((l) => {
          const li = document.createElement('li');
          appendInline(li, l.replace(/^\s*[-*•]\s+/, ''));
          ul.appendChild(li);
        });
        container.appendChild(ul);
      } else {
        const p = document.createElement('p');
        appendInline(p, lines.join(' '));
        container.appendChild(p);
      }
    });
  }

  function appendInline(parent, text) {
    text.split(/(\*\*[^*]+\*\*)/).forEach((part) => {
      if (!part) return;
      if (/^\*\*[^*]+\*\*$/.test(part)) {
        const strong = document.createElement('strong');
        strong.textContent = part.slice(2, -2);
        parent.appendChild(strong);
      } else {
        parent.appendChild(document.createTextNode(part));
      }
    });
  }

  /* The AI is the opening move, not the destination. Once it has answered,
     hand the visitor to the real conversation — carrying what they typed so
     they do not have to explain themselves twice. */
  let handoffShown = false;

  function offerHandoff(question) {
    if (handoffShown) return;
    handoffShown = true;

    const wrap = document.createElement('div');
    wrap.className = 'msg msg-handoff';

    const p = document.createElement('p');
    p.textContent = t('That is a first pass from my notes. The useful version is a conversation where I can ask you questions back — which is free, and usually thirty minutes.');
    wrap.appendChild(p);

    const row = document.createElement('div');
    row.className = 'handoff-actions';

    const book = document.createElement('a');
    book.className = 'btn btn-primary';
    book.href = 'https://calendly.com/quentin-dupard-call/30min';
    book.target = '_blank';
    book.rel = 'noopener';
    book.textContent = t('Talk to the real me');
    book.dataset.track = 'handoff_book';

    const write = document.createElement('button');
    write.className = 'btn btn-glass';
    write.type = 'button';
    write.textContent = t('Send it to me instead');
    write.dataset.track = 'handoff_write';
    write.addEventListener('click', () => {
      // Pre-fill the mailbox with what they already told the AI.
      const subject = $('#compose-subject');
      const body = $('#compose-body');
      if (subject && !subject.value) subject.value = question.slice(0, 110);
      if (body && !body.value) {
        body.value = question + '\n\n(Asked AI-me first. Sending it to you directly.)';
      }
      $('#inbox').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      setTimeout(() => $('#mail-new').click(), reduceMotion ? 0 : 700);
    });

    row.append(book, write);
    wrap.appendChild(row);
    chat.appendChild(wrap);
  }

  /* ══ Free tier ════════════════════════════════════════════
     A handful of questions free, then a paywall. The counter lives in
     localStorage, which a determined visitor can clear — that is fine for a
     $10 product where the point is a nudge, not DRM. Real enforcement needs
     the account system behind /api/ask, which is a server-side change.
     ────────────────────────────────────────────────────────── */
  const FREE_KEY = 'qd:asked';
  const FREE_LIMIT = 5;

  function asked() {
    try { return parseInt(localStorage.getItem(FREE_KEY) || '0', 10); }
    catch (_) { return 0; }
  }
  function countAsk() {
    try { localStorage.setItem(FREE_KEY, String(asked() + 1)); } catch (_) { /* private mode */ }
    paintQuota();
  }


  /* ══ Checkout ═════════════════════════════════════════════
     One place that knows the Payment Link. `prefilled_promo_code` only does
     anything if the Payment Link itself has promotion codes enabled — with
     that switch off, Stripe hides the promo field entirely and silently drops
     the parameter, which is exactly what "the code does not work" looks like. */
  const STRIPE_LINK = 'https://buy.stripe.com/6oUcN55Ridk40TwgqZ0oM00';

  /* Stripe's hosted customer portal. Paste the billing.stripe.com/p/login/…
     URL from Stripe -> Settings -> Billing -> Customer portal.

     Selling a subscription with no self-serve way out is not a missing
     feature, it is the thing consumer law is specifically about. Until the
     URL is set the link falls back to email, which is slower but is at least
     a route that exists. */
  const STRIPE_PORTAL = 'https://billing.stripe.com/p/login/6oUcN55Ridk40TwgqZ0oM00';
  const PROMO_KEY = 'qd:promo';

  function cancelLink() {
    const a = document.createElement('a');
    a.className = 'paywall-cancel';
    a.dataset.track = 'manage_subscription';
    if (STRIPE_PORTAL) {
      a.href = STRIPE_PORTAL;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = t('Manage or cancel your subscription');
    } else {
      a.href = 'mailto:quentin.dupard@gmail.com?subject=' +
               encodeURIComponent('Cancel my AI-me subscription');
      a.textContent = t('Cancel any time — email me and I will do it the same day');
    }
    return a;
  }

  function wonPromo() {
    try { return localStorage.getItem(PROMO_KEY) || ''; } catch (_) { return ''; }
  }

  function checkoutUrl() {
    const code = wonPromo();
    return code ? STRIPE_LINK + '?prefilled_promo_code=' + encodeURIComponent(code) : STRIPE_LINK;
  }

  /* Say the limit exists BEFORE someone hits it. A cap you only discover by
     running into it reads as a bait-and-switch, not a free tier. */
  function paintQuota() {
    const el = $('#ask-quota');
    if (!el) return;
    const left = Math.max(0, FREE_LIMIT - asked());
    if (left === 0) {
      el.textContent = t('Free questions used. ');
      el.className = 'ask-quota is-out';
    } else {
      el.textContent = `${left} of ${FREE_LIMIT} free question${left === 1 ? '' : 's'} left. `;
      el.className = 'ask-quota';
    }
  }

  function showPaywall() {
    const wrap = document.createElement('div');
    wrap.className = 'msg msg-paywall';

    const h = document.createElement('p');
    h.className = 'paywall-h';
    h.textContent = `That is your ${FREE_LIMIT} free questions.`;
    wrap.appendChild(h);

    const p = document.createElement('p');
    p.textContent = t('If AI-me is genuinely useful, it is $10 a month for unlimited questions. If it is not, do not pay — talk to me directly instead, which is free.');
    wrap.appendChild(p);

    const row = document.createElement('div');
    row.className = 'handoff-actions';

    /* Hosted Stripe checkout. Payment details never touch this site. */
    const pay = document.createElement('a');
    pay.className = 'btn btn-primary';
    pay.href = checkoutUrl();
    pay.target = '_blank';
    pay.rel = 'noopener';
    pay.textContent = t('Unlock for $10/month');
    pay.dataset.track = 'paywall_subscribe';

    const talk = document.createElement('a');
    talk.className = 'btn btn-glass';
    talk.href = 'https://calendly.com/quentin-dupard-call/30min';
    talk.target = '_blank';
    talk.rel = 'noopener';
    talk.textContent = t('Or just talk to me — free');
    talk.dataset.track = 'paywall_talk';

    row.append(pay, talk);
    wrap.appendChild(row);

    const deal = document.createElement('button');
    deal.className = 'paywall-deal';
    deal.type = 'button';
    deal.setAttribute('data-snake-open', '');
    deal.textContent = t('Want a discount code?');
    wrap.appendChild(deal);

    const note = document.createElement('p');
    note.className = 'paywall-note';
    note.textContent = t('The research on this site stays free and ungated either way.');
    wrap.appendChild(note);

    // Shown before anyone pays, not buried in a receipt afterwards.
    const cancel = document.createElement('p');
    cancel.className = 'paywall-note';
    cancel.appendChild(cancelLink());
    wrap.appendChild(cancel);

    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;
    track('paywall_shown', { target: String(asked()) });
  }

  /* The running conversation. Held here rather than on the server because the
     endpoint is stateless and there is no account to key a session to — the
     browser is the only thing that knows what was already said.

     Only the last few turns travel. The corpus already fills most of the
     prompt, and a transcript that grows without bound would push it out. */
  const turns = [];
  const HISTORY_TURNS = 6;          // three exchanges
  const HISTORY_CHARS = 1200;       // per message

  async function submitQuestion(question) {
    if (ask.classList.contains('is-loading')) return;

    if (asked() >= FREE_LIMIT) {
      addMessage('you', question);
      input.value = '';
      showPaywall();
      return;
    }
    countAsk();
    track('ask_submit', { length: question.length });

    addMessage('you', question);
    input.value = '';

    const reply = addMessage('ai', '');
    reply.msg.classList.add('streaming');
    ask.classList.add('is-loading');

    let full = '';
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          q: question,
          // Without this every question was answered as if it were the first,
          // which is why follow-ups came back generic.
          history: turns.slice(-HISTORY_TURNS).map(m => ({
            role: m.role,
            content: m.content.slice(0, HISTORY_CHARS)
          })),
          // Read by /admin so questions can be grouped into a conversation and
          // shown in the language they were asked in. `quiet` carries the
          // measurement opt-out through, so declining it also declines this.
          lang: (document.documentElement.getAttribute('lang') || 'en').slice(0, 2),
          thread: (function () {
            try { return (sessionStorage.getItem('qd:sid') || '').slice(0, 12); }
            catch (_) { return ''; }
          }()),
          quiet: optedOut()
        })
      });

      if (res.status === 429) {
        renderMarkdown(reply.body, "You've hit the rate limit — this is free, so it's capped per visitor. Give it a minute, or email me and skip the queue entirely.");
        throw new Error('handled');
      }
      if (!res.ok || !res.body) throw new Error('ask endpoint ' + res.status);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        reply.body.textContent = full;
        chat.scrollTop = chat.scrollHeight;
      }
      renderMarkdown(reply.body, full);
    } catch (err) {
      if (err.message !== 'handled') renderMarkdown(reply.body, offlineAnswer(question));
    }

    /* Recorded after the exchange, not before: a question that never got an
       answer would otherwise sit in the history as an unanswered turn and skew
       everything asked afterwards. Only a real reply earns a place. */
    if (full.trim()) {
      turns.push({ role: 'user', content: question });
      turns.push({ role: 'assistant', content: full.trim() });
    }

    reply.msg.classList.remove('streaming');
    ask.classList.remove('is-loading');
    offerHandoff(question);
    chat.scrollTop = chat.scrollHeight;
  }

  /* Real answers, saved. These are shown whenever /api/ask cannot answer —
     before the function is deployed, and also when it is deployed but failing,
     which is the case a visitor is far more likely to meet. They are worth
     more than an apology, so they are written to stand on their own.
     exists — and honest that it's a stub. */
  const CANNED = [
    {
      match: /activation|onboard|signup|sign-up|flat/i,
      text: "**Flat activation is almost never a signup problem — it's a first-value problem.**\n\nFind the single action that makes someone go \"oh, I see it\", then measure what percentage of signups reach it in week one. Most teams have never measured this and are shocked by the number. It is usually somewhere between 10% and 25%.\n\nThen cut ruthlessly between signup and that moment:\n\n- Every field in the signup form that isn't required to deliver value\n- Every empty state that shows a blank screen instead of sample data\n- Every step that requires a teammate, an admin, or an integration before anything works\n\nThe fastest win I see repeatedly: pre-populate the account with realistic demo data so the product is never empty on first open.\n\n*(A saved answer — AI-me is offline right now. Ask me the same thing directly and you will get a better one: quentin.dupard@gmail.com)*"
    },
    {
      match: /pricing|price|charge|packag|monetis|monetiz/i,
      text: "**If you've never changed your pricing, you are almost certainly underpriced — and worse, priced on the wrong metric.**\n\nStart with the metric, not the number. Per-seat is the default because it's easy to bill, not because it's right. It only works when value genuinely scales with headcount; if your product gets more valuable with usage, data volume, or transactions, per-seat actively caps your revenue and punishes your best customers.\n\nThe test: as a customer succeeds wildly with your product, does your invoice grow? If not, you've built a business that has to keep winning new logos just to stand still.\n\nA 10-15% price rise on new customers is the lowest-risk experiment in software. Nobody churns over it, and it flows straight to the bottom line.\n\n*(A saved answer — AI-me is offline right now. Ask me the same thing directly and you will get a better one: quentin.dupard@gmail.com)*"
    },
    {
      match: /cac|sales.?led|expensive|acquisition|climbing/i,
      text: "**Rising CAC in a sales-led motion usually means you've exhausted your best segment, not that your sales team got worse.**\n\nSegment your closed-won by size and use case, then look at payback period per segment rather than in aggregate. The blended number hides the story. You'll typically find one segment where payback is under 12 months and two where it's over 24.\n\nThe move is uncomfortable but simple: stop selling to the slow segments with humans. Either give them a self-serve path or let them go. Every rep-hour spent on a 30-month payback deal is stolen from one that pays back in nine.\n\n*(A saved answer — AI-me is offline right now. Ask me the same thing directly and you will get a better one: quentin.dupard@gmail.com)*"
    },
    {
      match: /more clients|new clients|get clients|leads|pipeline|find customers|acquisition/i,
      text: "**Nearly everyone who asks me this has enough traffic already. They are losing it between the landing page and the first successful use of the product.**\n\nSo before you spend another euro on acquisition, check three things in this order:\n\n- Is your positioning specific enough to exclude people? If your homepage could describe three other companies, paid spend just buys confusion faster.\n- Do the people who already sign up reach first value in week one? Measure it. The number is usually far worse than anyone guesses, and it caps everything marketing can achieve.\n- Can you identify your best segment from closed-won data? Not your favourite customers, the ones with the shortest payback. Most teams have never segmented it and are averaging three very different businesses together.\n\nIf all three are genuinely healthy then yes, it is a volume problem and you should go buy attention. That is rarer than it sounds.\n\n*(A saved answer — AI-me is offline right now. Ask me the same thing directly and you will get a better one: quentin.dupard@gmail.com)*"
    },
    {
      match: /expansion|retention|upsell|nrr|churn/i,
      text: "**Good retention with no expansion means you've built something people keep, but not something they grow into.**\n\nNet revenue retention above 110% is what makes a SaaS business compound. Below 100%, you're refilling a leaking bucket with new logos forever, and growth gets more expensive every quarter.\n\nThe fix is structural, not a CS playbook:\n\n- Is there a natural axis along which a happy customer consumes more — seats, usage, data, workflows?\n- If not, is there a genuinely more valuable tier for your power users, or does everyone hit the ceiling on day one?\n- Do you notice when an account outgrows its plan, or do you find out at renewal?\n\n*(A saved answer — AI-me is offline right now. Ask me the same thing directly and you will get a better one: quentin.dupard@gmail.com)*"
    }
  ];

  function offlineAnswer(q) {
    const hit = CANNED.find(c => c.match.test(q));
    if (hit) return hit.text;
    return "**AI-me isn't connected on this host yet.**\n\nThis page is running without its edge function, so I'm answering from a few cached examples rather than the real thing. Try one of the suggestions above to see the shape of it — or just email quentin.dupard@gmail.com and get the answer from the original.";
  }

  function initAsk() {
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (q) submitQuestion(q);
    });

    $$('#ask-chips .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const q = chip.textContent.trim();
        track('chip_click', { target: q.slice(0, 60) });
        submitQuestion(q);
      });
    });

    // Symptom picker feeds the same transcript.
    $$('.symptom').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.q;
        if (!q) return;
        $('#top').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        setTimeout(() => submitQuestion(q), reduceMotion ? 0 : 650);
      });
    });

    const talkAi = $('#talk-ai');
    if (talkAi) {
      talkAi.addEventListener('click', () => {
        $('#top').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        setTimeout(() => input.focus({ preventScroll: true }), reduceMotion ? 0 : 700);
      });
    }
  }

  /* ══ Boot ═════════════════════════════════════════════════ */
  function boot() {
    initReveal();
    initScrollMeta();
    initNewsletter();
    initCarousel();
    initModes();
    initCart();

    /* The fort and the inbox render from window.QD_DESKTOP / QD_MAILBOX. Those
       ship with the page, so both work with no network at all; /api/content
       only overlays them when something has actually been edited in /admin. */
    loadContent().then(() => { initMail(); initMac(); });
    initAsk();
    paintQuota();
    initVisitor();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

/* Google preferred-sources button: theme it to the current site theme,
   then load Google's renderer. Language is auto-detected from the page. */
(function () {
  var slot = document.querySelector('[google-add-preferred-source-btn]');
  if (!slot) return;
  var dark = document.documentElement.getAttribute('data-theme') === 'dark';
  slot.setAttribute('data-theme', dark ? 'dark' : 'light');
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://news.google.com/swg/js/v1/publisher.js';
  document.head.appendChild(s);
})();
