/* ==========================================================
   Quentin Dupard — Animation Layer
   - Scroll progress bar
   - Stat counter (count-up)
   - Magnetic buttons
   - Card 3D tilt
   - Hero text stagger reveal
   - Hero portrait parallax (mouse-follow)
   - Marquee pause-on-hover
   - Cursor follower (desktop only)
   - Section reveal observer
   All animations respect prefers-reduced-motion.
   ========================================================== */

(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  /* ───────── 1. Scroll progress bar ───────── */
  function initScrollProgress() {
    const bar = document.createElement('div');
    bar.className = 'scroll-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);

    let ticking = false;
    function update() {
      const h = document.documentElement;
      const pct = (h.scrollTop) / (h.scrollHeight - h.clientHeight) * 100;
      bar.style.transform = `scaleX(${pct / 100})`;
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  /* ───────── 2. Section reveal (IntersectionObserver) ───────── */
  function initRevealObserver() {
    const obs = new IntersectionObserver(entries => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          e.target.style.transitionDelay = `${Math.min(i * 55, 180)}ms`;
          e.target.classList.add('in');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.07, rootMargin: '0px 0px -28px 0px' });
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
  }

  /* ───────── 3. Hero title — character stagger reveal ───────── */
  function initHeroTitle() {
    const titles = document.querySelectorAll('.hero-title, .page-hero h1, .cta-title');
    titles.forEach(title => {
      // Process top-level text nodes and spans, preserve <br>
      title.querySelectorAll('span, br').forEach((n) => { /* keep */ });
      const lines = Array.from(title.childNodes);
      title.innerHTML = '';
      lines.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent;
          [...text].forEach((ch, i) => {
            const span = document.createElement('span');
            span.className = 'char';
            span.textContent = ch === ' ' ? ' ' : ch;
            span.style.animationDelay = `${0.04 * i}s`;
            title.appendChild(span);
          });
        } else if (node.nodeName === 'BR') {
          title.appendChild(document.createElement('br'));
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          // wrap inner text of inline span (like .stroke / .accent / .ghost)
          const inner = node.textContent;
          const wrapper = document.createElement(node.nodeName.toLowerCase());
          wrapper.className = node.className;
          [...inner].forEach((ch, i) => {
            const span = document.createElement('span');
            span.className = 'char';
            span.textContent = ch === ' ' ? ' ' : ch;
            span.style.animationDelay = `${0.04 * i + 0.15}s`;
            wrapper.appendChild(span);
          });
          title.appendChild(wrapper);
        }
      });
    });
  }

  /* ───────── 4. Stat counter ───────── */
  function initStatCounter() {
    const stats = document.querySelectorAll('.stat-num');
    if (!stats.length) return;

    function animate(el, target) {
      const duration = 1400;
      const start = performance.now();
      const sup = el.querySelector('sup');
      const supText = sup ? sup.outerHTML : '';
      function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        // ease out cubic
        const eased = 1 - Math.pow(1 - t, 3);
        const value = Math.round(target * eased);
        el.firstChild.nodeValue = value;
        if (t < 1) requestAnimationFrame(frame);
      }
      // capture original sup, replace text node
      el.innerHTML = '0' + supText;
      requestAnimationFrame(frame);
    }

    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target;
        const raw = el.textContent.trim();
        const m = raw.match(/(\d+)/);
        if (m) animate(el, parseInt(m[1], 10));
        obs.unobserve(el);
      });
    }, { threshold: 0.5 });

    stats.forEach(s => obs.observe(s));
  }

  /* ───────── 5. Magnetic buttons (desktop only) ───────── */
  function initMagnetic() {
    if (isTouch) return;
    const els = document.querySelectorAll(
      '.btn-dark, .btn-blue, .btn-outline, .btn-ghost-light, .nav-cta, .form-submit'
    );
    els.forEach(el => {
      el.classList.add('magnetic');
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        el.style.transform = `translate(${x * 0.18}px, ${y * 0.22}px)`;
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = '';
      });
    });
  }

  /* ───────── 6. Card 3D tilt + sheen (desktop only) ───────── */
  function initTilt() {
    if (isTouch) return;
    const cards = document.querySelectorAll('.card, .who-card, .step, .cred, .contact-channel, .faq-item');
    cards.forEach(card => {
      card.classList.add('tilt');
      // sheen overlay
      const sheen = document.createElement('span');
      sheen.className = 'tilt-sheen';
      sheen.setAttribute('aria-hidden', 'true');
      card.appendChild(sheen);

      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        const rx = (y - 0.5) * -4;
        const ry = (x - 0.5) * 4;
        card.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`;
        sheen.style.background = `radial-gradient(420px circle at ${x * 100}% ${y * 100}%, rgba(91,139,196,0.12), transparent 45%)`;
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
        sheen.style.background = '';
      });
    });
  }

  /* ───────── 7. Hero portrait parallax ───────── */
  function initPortraitParallax() {
    if (isTouch) return;
    const wraps = document.querySelectorAll('.hero-portrait-wrap, .about-portrait');
    if (!wraps.length) return;

    document.addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth - 0.5);
      const y = (e.clientY / window.innerHeight - 0.5);
      wraps.forEach(w => {
        const img = w.querySelector('img');
        if (img) {
          img.style.transform = `scale(1.06) translate(${x * -10}px, ${y * -10}px)`;
        }
      });
    });
  }

  /* ───────── 8. Marquee pause-on-hover ───────── */
  function initMarquee() {
    document.querySelectorAll('.marquee-wrap').forEach(wrap => {
      wrap.addEventListener('mouseenter', () => {
        wrap.querySelectorAll('.marquee-inner').forEach(i => i.style.animationPlayState = 'paused');
      });
      wrap.addEventListener('mouseleave', () => {
        wrap.querySelectorAll('.marquee-inner').forEach(i => i.style.animationPlayState = 'running');
      });
    });
  }

  /* ───────── 9. Cursor follower (desktop only) ───────── */
  function initCursor() {
    if (isTouch) return;
    const dot = document.createElement('div');
    dot.className = 'cursor-dot';
    dot.setAttribute('aria-hidden', 'true');
    const ring = document.createElement('div');
    ring.className = 'cursor-ring';
    ring.setAttribute('aria-hidden', 'true');
    document.body.appendChild(dot);
    document.body.appendChild(ring);

    let mx = 0, my = 0, rx = 0, ry = 0;
    document.addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = `translate(${mx}px, ${my}px)`;
    });

    function loop() {
      rx += (mx - rx) * 0.14;
      ry += (my - ry) * 0.14;
      ring.style.transform = `translate(${rx}px, ${ry}px)`;
      requestAnimationFrame(loop);
    }
    loop();

    // grow ring on hoverable elements
    document.querySelectorAll('a, button, input, textarea, select, .card, .who-card, .step').forEach(el => {
      el.addEventListener('mouseenter', () => ring.classList.add('hover'));
      el.addEventListener('mouseleave', () => ring.classList.remove('hover'));
    });
  }

  /* ───────── 10. Animated scroll-down hint on hero ───────── */
  function initScrollHint() {
    const hero = document.querySelector('.hero');
    if (!hero) return;
    const hint = document.createElement('div');
    hint.className = 'scroll-hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.innerHTML = '<span class="scroll-hint-text">Scroll</span><span class="scroll-hint-line"></span>';
    hero.appendChild(hint);

    window.addEventListener('scroll', () => {
      if (window.scrollY > 120) hint.classList.add('hide');
      else hint.classList.remove('hide');
    }, { passive: true });
  }

  /* ───────── Boot ───────── */
  function boot() {
    initRevealObserver();
    if (reduce) return; // skip the heavy stuff for reduced-motion users
    initScrollProgress();
    initHeroTitle();
    initStatCounter();
    initMagnetic();
    initTilt();
    initPortraitParallax();
    initMarquee();
    initScrollHint();
    // Cursor is opt-in: only enabled if body has data-cursor="true"
    if (document.body.dataset.cursor === 'true') initCursor();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
