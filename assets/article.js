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
