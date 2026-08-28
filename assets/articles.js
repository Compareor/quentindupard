/* ==========================================================
   The article registry. Newest first.

   article.js reads this to build the "Read more" block on every
   article and on the about/privacy pages, always excluding the
   page it is on. tools/new-article.py prepends new entries.

   Titles are English source strings: QD.t() translates them at
   render time, so a new title must also be added to
   i18n/runtime.json or French and Spanish visitors will see the
   English one.
   ========================================================== */
window.QD_ARTICLES = [
  {
    slug: 'business-model-generation',
    title: 'Business Model Generation by Osterwalder and Pigneur: a camera, not a compass',
    kind: 'Book review',
    minutes: 9,
    img: '/assets/research/business-model-generation.svg'
  },
  {
    slug: 'influence-robert-cialdini',
    title: 'Influence by Robert Cialdini: which of the six still work on a machine',
    kind: 'Book review',
    minutes: 10,
    img: '/assets/research/influence-robert-cialdini.svg?v=2'
  },
  {
    slug: 'hooked-nir-eyal',
    title: 'Hooked by Nir Eyal: what survives when you are not a social app',
    kind: 'Book review',
    minutes: 9,
    img: '/assets/research/hooked-nir-eyal.svg?v=2'
  }
];
