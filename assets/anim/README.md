# Animation sources

The icons on this site are hand-built animated SVG (`assets/home.css`, the
`.ico` block). They need no library, follow the theme colour, and respect
reduced-motion. For anything richer, drop a Lottie `.json` in this folder and
mount it — no code changes needed:

```html
<div data-lottie="/assets/anim/your-file.json" data-lottie-trigger="scroll"></div>
```

`assets/lottie.js` fetches the runtime only if such an element exists, so pages
without one pay nothing. Add `<script src="/assets/lottie.js" defer></script>`
to any page where you use it.

Triggers: `scroll` (plays once on entering view, default), `hover`, `auto`.
Add `data-lottie-loop="true"` to loop.

---

## Where to get files, with the licence that matters

**Check the licence per file. It varies even within one site.**

| Source | Licence | Good for |
|---|---|---|
| [LottieFiles Free](https://lottiefiles.com/free-animations) | Mostly *Lottie Simple License* (free commercial use, attribution appreciated). Some are CC-BY and **require** credit. | Illustrated moments, empty states, success ticks |
| [Rive Community](https://rive.app/community) | Per-file, often CC. Needs the Rive runtime, not Lottie. | Interactive/state-driven animation |
| [Lucide](https://lucide.dev) | **MIT** — no attribution needed | Clean icon set; animate with the same CSS technique used here |
| [Tabler Icons](https://tabler.io/icons) | **MIT** | 5000+ icons, same approach |
| [GSAP](https://gsap.com) | **Free**, all plugins included since Webflow acquired it | Scroll-driven sequences beyond what CSS does well |
| [Motion](https://motion.dev) | **MIT**, ~5KB | Spring physics, lighter than GSAP |
| [Animate.css](https://animate.style) | **MIT** | Drop-in entrance/exit classes |

## Two cautions

1. **Weight.** The full `lottie-web` runtime is ~250KB; this loader uses
   `lottie_light` (~150KB) which drops expression support. A single decorative
   animation rarely justifies either. Prefer SVG for icons.
2. **Colour.** Lottie colours are baked into the JSON. They will not follow the
   light/dark palette or the glass transparency control the way the hand-built
   icons do. Recolour the file in LottieFiles' editor before shipping it.
