/* ==========================================================
   Optional Lottie mount.

   The site's own icons are hand-built SVG and need none of this.
   This exists so you can drop a .json animation in without touching
   any code:

     <div data-lottie="/assets/anim/thing.json"
          data-lottie-loop="true"
          data-lottie-trigger="scroll"></div>

   triggers: "scroll" (plays once when it enters view, default),
             "hover"  (plays on pointer enter),
             "auto"   (plays immediately)

   The 250KB lottie-web runtime is fetched ONLY if a [data-lottie]
   element is actually on the page, so pages without one pay nothing.
   ========================================================== */

(function () {
  'use strict';

  const mounts = Array.from(document.querySelectorAll('[data-lottie]'));
  if (!mounts.length) return;

  const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie_light.min.js';

  function loadRuntime() {
    return new Promise((resolve, reject) => {
      if (window.lottie) return resolve(window.lottie);
      const tag = document.createElement('script');
      tag.src = CDN;
      tag.async = true;
      tag.onload = () => resolve(window.lottie);
      tag.onerror = () => reject(new Error('lottie runtime failed to load'));
      document.head.appendChild(tag);
    });
  }

  loadRuntime().then((lottie) => {
    if (!lottie) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    mounts.forEach((el) => {
      const loop = el.dataset.lottieLoop === 'true';
      const trigger = el.dataset.lottieTrigger || 'scroll';

      const anim = lottie.loadAnimation({
        container: el,
        renderer: 'svg',
        loop: loop,
        autoplay: false,
        path: el.dataset.lottie
      });

      // Reduced motion still shows the artwork, just parked on a frame
      // rather than moving.
      if (reduce) {
        anim.addEventListener('DOMLoaded', () => anim.goToAndStop(anim.totalFrames - 1, true));
        return;
      }

      if (trigger === 'auto') {
        anim.play();
      } else if (trigger === 'hover') {
        el.addEventListener('pointerenter', () => anim.goToAndPlay(0, true));
      } else if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            anim.play();
            if (!loop) io.unobserve(entry.target);
          });
        }, { threshold: 0.3 });
        io.observe(el);
      } else {
        anim.play();
      }
    });
  }).catch(() => {
    // No runtime, no animation. Nothing else on the page depends on it.
  });
})();
