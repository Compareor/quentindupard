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
    slug: 'from-ranking-to-reasoning',
    title: 'From ranking to reasoning: when the answer starts buying',
    kind: 'Working paper',
    minutes: 12,
    img: '/assets/research/from-ranking-to-reasoning-thumb-480.jpg'
  },
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

/* ── Hub filter + pagination ─────────────────────────────────
   The chips and the cards carry the same translated kind label
   (one source string, one translation), so matching on visible
   text works in every language without a catalogue. Cards stay
   in the HTML for crawlers; the page only ever HIDES extras. */
(function () {
  'use strict';
  var grid = document.querySelector('.hub-grid');
  var btns = Array.prototype.slice.call(document.querySelectorAll('.hub-filter-btn'));
  if (!grid || !btns.length) return;
  var cards = Array.prototype.slice.call(grid.querySelectorAll('.hub-card'));
  var more = document.getElementById('hub-more');
  var PAGE = 9;
  var shown = PAGE;

  function kindOf(card) {
    var k = card.querySelector('.hub-kind');
    return k ? k.textContent.trim() : '';
  }
  function activeTag() {
    var on = btns.filter(function (b) { return b.classList.contains('is-on'); })[0];
    return (on && !on.hasAttribute('data-all')) ? on.textContent.trim() : '';
  }
  function apply() {
    var tag = activeTag();
    var match = cards.filter(function (c) { return !tag || kindOf(c) === tag; });
    cards.forEach(function (c) { c.hidden = true; });
    match.slice(0, shown).forEach(function (c) { c.hidden = false; });
    if (more) more.hidden = match.length <= shown;
  }
  btns.forEach(function (b) {
    b.addEventListener('click', function () {
      btns.forEach(function (x) {
        x.classList.toggle('is-on', x === b);
        x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
      });
      shown = PAGE;
      apply();
    });
  });
  if (more) more.addEventListener('click', function () { shown += PAGE; apply(); });
  apply();
})();
