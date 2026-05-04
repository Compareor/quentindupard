/* ==========================================================
   Quentin Dupard — Animation Layer  (v2 — fixed)
   - Section reveal observer (always)
   - Word-stagger reveal on hero / page-hero / CTA titles
   - Stat reveal (clean opacity rise — no count-up bug)
   - Magnetic buttons (desktop only)
   - Card 3D tilt (desktop only)
   - Hero portrait parallax (desktop only)
   - Marquee pause-on-hover
   - Mobile hamburger menu (always)
   - Scroll progress bar
   - Scroll-down hint on hero
   Respects prefers-reduced-motion.
   ========================================================== */

(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  /* 1. Scroll progress bar */
  function initScrollProgress() {
    const bar = document.createElement('div');
    bar.className = 'scroll-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    let ticking = false;
    function update() {
      const h = document.documentElement;
      const pct = h.scrollTop / (h.scrollHeight - h.clientHeight) * 100;
      bar.style.transform = `scaleX(${pct / 100})`;
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  /* 2. Section reveal */
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

  /* 3. Hero title — WORD stagger (preserves word wrap) */
  function initHeroTitle() {
    const titles = document.querySelectorAll('.hero-title, .page-hero h1, .cta-title');
    titles.forEach(title => {
      let i = 0;
      function processTextNode(text, parent, baseDelay) {
        const parts = text.split(/(\s+)/);
        parts.forEach(p => {
          if (/^\s+$/.test(p)) {
            parent.appendChild(document.createTextNode(p));
          } else if (p.length) {
            const span = document.createElement('span');
            span.className = 'word';
            span.textContent = p;
            span.style.animationDelay = `${baseDelay + 0.06 * i}s`;
            parent.appendChild(span);
            i++;
          }
        });
      }
      const original = Array.from(title.childNodes);
      title.innerHTML = '';
      original.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          processTextNode(node.textContent, title, 0);
        } else if (node.nodeName === 'BR') {
          title.appendChild(document.createElement('br'));
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const wrapper = document.createElement(node.nodeName.toLowerCase());
          wrapper.className = node.className;
          processTextNode(node.textContent, wrapper, 0.1);
          title.appendChild(wrapper);
        }
      });
    });
  }

  /* 4. Stat reveal — simple opacity rise (no flaky counter) */
  function initStatReveal() {
    const stats = document.querySelectorAll('.stat-num, .stat-label');
    stats.forEach((el, i) => {
      el.classList.add('stat-fade');
      el.style.transitionDelay = `${0.08 * i}s`;
    });
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('show');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.4 });
    stats.forEach(s => obs.observe(s));
  }

  /* 5. Magnetic buttons */
  function initMagnetic() {
    if (isTouch) return;
    document.querySelectorAll(
      '.btn-dark, .btn-blue, .btn-outline, .btn-ghost-light, .nav-cta, .form-submit'
    ).forEach(el => {
      el.classList.add('magnetic');
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        el.style.transform = `translate(${x * 0.15}px, ${y * 0.18}px)`;
      });
      el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    });
  }

  /* 6. Card tilt + sheen */
  function initTilt() {
    if (isTouch) return;
    document.querySelectorAll('.card, .who-card, .step, .contact-channel, .faq-item').forEach(card => {
      card.classList.add('tilt');
      const sheen = document.createElement('span');
      sheen.className = 'tilt-sheen';
      sheen.setAttribute('aria-hidden', 'true');
      card.appendChild(sheen);
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        const rx = (y - 0.5) * -3;
        const ry = (x - 0.5) * 3;
        card.style.transform = `perspective(1100px) rotateX(${rx}deg) rotateY(${ry}deg)`;
        sheen.style.background = `radial-gradient(420px circle at ${x * 100}% ${y * 100}%, rgba(91,139,196,0.10), transparent 45%)`;
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
        sheen.style.background = '';
      });
    });
  }

  /* 7. Hero portrait parallax */
  function initPortraitParallax() {
    if (isTouch) return;
    const wraps = document.querySelectorAll('.hero-portrait-wrap, .about-portrait');
    if (!wraps.length) return;
    document.addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth - 0.5);
      const y = (e.clientY / window.innerHeight - 0.5);
      wraps.forEach(w => {
        const img = w.querySelector('img');
        if (img) img.style.transform = `scale(1.05) translate(${x * -8}px, ${y * -8}px)`;
      });
    });
  }

  /* 8. Marquee pause-on-hover */
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

  /* 9. Mobile hamburger menu */
  function initMobileMenu() {
    const nav = document.querySelector('.site-nav');
    const links = document.querySelector('.site-nav .nav-links');
    if (!nav || !links) return;

    // Build hamburger button
    const burger = document.createElement('button');
    burger.className = 'nav-burger';
    burger.setAttribute('aria-label', 'Toggle menu');
    burger.setAttribute('aria-expanded', 'false');
    burger.innerHTML = '<span></span><span></span><span></span>';
    nav.appendChild(burger);

    // Build mobile drawer
    const drawer = document.createElement('div');
    drawer.className = 'mobile-drawer';
    drawer.setAttribute('aria-hidden', 'true');
    // Clone link content
    const cloneLinks = Array.from(links.querySelectorAll('a')).map(a => {
      const cloned = a.cloneNode(true);
      cloned.classList.remove('nav-cta');
      return cloned.outerHTML;
    }).join('');
    drawer.innerHTML = `
      <div class="mobile-drawer-inner">
        <div class="mobile-drawer-links">${cloneLinks}</div>
        <div class="mobile-drawer-foot">
          <a href="mailto:quentin.dupard@gmail.com">quentin.dupard@gmail.com</a>
          <a href="https://www.linkedin.com/in/quentindupard/" target="_blank" rel="noopener">LinkedIn</a>
        </div>
      </div>
    `;
    document.body.appendChild(drawer);

    function close() {
      burger.classList.remove('open');
      drawer.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
      drawer.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
    function open() {
      burger.classList.add('open');
      drawer.classList.add('open');
      burger.setAttribute('aria-expanded', 'true');
      drawer.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
    burger.addEventListener('click', () => {
      drawer.classList.contains('open') ? close() : open();
    });
    drawer.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') close();
      if (e.target === drawer) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }

  /* 10. Scroll-down hint */
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

  /* Boot */
  function boot() {
    initRevealObserver();
    initMobileMenu(); // mobile menu always available
    if (reduce) return;
    initScrollProgress();
    initHeroTitle();
    initStatReveal();
    initMagnetic();
    initTilt();
    initPortraitParallax();
    initMarquee();
    initScrollHint();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
