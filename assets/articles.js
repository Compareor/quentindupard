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
    slug: 'value-proposition-canvas',
    title: 'The Value Proposition Canvas still works',
    kind: 'Framework',
    minutes: 7,
    img: '/assets/research/value-proposition-canvas-thumb-480.jpg'
  },
  {
    slug: 'services-the-new-software',
    title: "Selling the work: Sequoia's services thesis, applied to your business",
    kind: 'Commentary',
    minutes: 8,
    img: '/assets/research/services-the-new-software-thumb-480.jpg'
  },
  {
    slug: 'business-model-generation',
    title: 'Business Model Generation by Osterwalder and Pigneur: a camera, not a compass',
    kind: 'Book review',
    minutes: 9,
    img: '/assets/research/business-model-generation-thumb-480.jpg'
  },
  {
    slug: 'influence-robert-cialdini',
    title: 'Influence by Robert Cialdini: which of the six still work on a machine',
    kind: 'Book review',
    minutes: 10,
    img: '/assets/research/influence-robert-cialdini-thumb-480.jpg'
  },
  {
    slug: 'hooked-nir-eyal',
    title: 'Hooked by Nir Eyal: what survives when you are not a social app',
    kind: 'Book review',
    minutes: 9,
    img: '/assets/research/hooked-nir-eyal-thumb-480.jpg'
  }
];
