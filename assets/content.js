/* ==========================================================
   EDIT THIS FILE, NOT THE CODE.

   Everything the mailbox and the desktop display lives here.
   Add, remove or reorder entries freely — the UI is built from
   whatever is in these two arrays.
   ========================================================== */

/* ── MAILBOX ──────────────────────────────────────────────
   TODO(Quentin): these are illustrative placeholders, not real
   endorsements. Replace them with recommendations you actually
   have — your LinkedIn recommendations are the obvious source,
   and real ones are worth far more than invented ones.

   Fields:
     from      display name
     email     shown in the header line
     role      appears under the name
     subject   list + header
     time      list column
     body      array of paragraphs
     attach    optional [{ name, href, size }]
   ────────────────────────────────────────────────────────── */
window.QD_MAILBOX = [
  {
    id: 'rec-pricing',
    from: 'Marta Renner',
    email: 'marta@—.com',
    role: 'Co-founder, B2B analytics platform',
    subject: 'Re: the pricing work — numbers are in',
    time: '09:14',
    body: [
      'Quick update since you asked me to report back after the quarter.',
      'We did the thing you told us to do and hated hearing: moved off pure per-seat onto a usage component, and put the 12% increase on new logos only. Nobody churned. Not one account. You said that would happen and I genuinely did not believe you.',
      'The part I did not expect was how much easier it made sales conversations. The pricing now explains what we are, which is more or less what you said it would do.',
      'Happy to be a reference for you any time.'
    ],
    attach: [{ name: 'Pricing-Teardown.pdf', href: '/assets/docs/pricing-teardown-sample.pdf', size: '4.9 KB' }]
  },
  {
    id: 'rec-activation',
    from: 'Daniel Osei',
    email: 'daniel@—.io',
    role: 'Head of Product, developer tooling',
    subject: 'The demo-data thing worked',
    time: 'Yesterday',
    body: [
      'You told us our activation problem was not an onboarding problem and that we should stop building onboarding. That was an annoying meeting.',
      'We pre-populated new workspaces with realistic sample data instead. Week-one activation moved more in six weeks than it had in the previous three quarters of onboarding work.',
      'Attaching the audit doc you left us, mostly so I have it somewhere I can find it.'
    ],
    attach: [{ name: 'Activation-Audit.pdf', href: '/assets/docs/activation-audit-sample.pdf', size: '4.5 KB' }]
  },
  {
    id: 'rec-positioning',
    from: 'Sofia Lindqvist',
    email: 'sofia@—.com',
    role: 'CEO, vertical SaaS',
    subject: 'Recommendation — happy to put this in writing',
    time: 'Mon',
    body: [
      'You asked for something you could quote. Here it is.',
      'What Quentin does is not strategy consulting. He turns up, spends an uncomfortable amount of time asking what you actually sell, and then tells you the thing your team has been circling for a year but nobody wanted to say. In our case it was that we were describing ourselves as a platform when we were selling a workflow.',
      'Changing that sentence changed our conversion rate. It cost us a two-week engagement and no engineering time at all.',
      'He is also genuinely willing to tell you when he is not the right person, which is rarer than it should be.'
    ]
  },
  {
    id: 'rec-courses',
    from: 'Amara Boateng',
    email: 'amara@—.com',
    role: 'Founder, online course business',
    subject: 'Best money we spent this year',
    time: 'Fri',
    body: [
      'I wanted to say thank you properly rather than in a Slack message.',
      'We had been blaming the ads. You looked at the funnel for about twenty minutes and said the ads were fine, the checkout was the problem, and the tier structure was making people choose between three things they did not understand.',
      'We rebuilt the offer the way you suggested. Same traffic, same spend, noticeably more sales. My co-founder still brings it up.',
      'If anyone wants to talk to a happy client, send them to me.'
    ]
  },
  {
    id: 'rec-grocery',
    from: 'Tomas Ricci',
    email: 'tomas@—.it',
    role: 'Owner, independent grocery',
    subject: 'It worked and I still do not have a marketing team',
    time: 'Thu',
    body: [
      'I run a shop. I was fairly sure none of this applied to me.',
      'You did not try to sell me software or a funnel. You looked at what we already had, changed what we put in front of people and what we charged for the bundles, and it moved.',
      'Whatever you call what you do, it is not what the agencies were trying to sell me.'
    ]
  },
  {
    id: 'rec-marketplace',
    from: 'Priya Raman',
    email: 'priya@—.co',
    role: 'Growth lead, comparison marketplace',
    subject: 'CAC finally stopped climbing',
    time: 'Wed',
    body: [
      'The segment analysis was the unlock. We had been averaging three completely different businesses together and wondering why the blended number kept getting worse.',
      'Once we split payback by segment it was obvious which one to stop paying for. That conversation took an afternoon and saved us a quarter of arguing.',
      'Thanks again. Genuinely useful.'
    ]
  },
  {
    id: 'rec-nope',
    from: 'Quentin Dupard',
    email: 'quentin.dupard@gmail.com',
    role: 'The one who said no',
    subject: 'Re: can you help us with our Series B deck',
    time: 'Mon',
    body: [
      'Honestly — no, and you should not pay me for this.',
      'You do not have a narrative problem, you have a retention problem, and no deck survives a diligence process where net revenue retention is where yours currently is. Any consultant who takes this brief is selling you a nicer way to present the issue.',
      'Fix the expansion mechanics first. If you still want help with the story in two quarters, come back and I will do it properly.'
    ],
    attach: [{ name: 'How-I-Work.pdf', href: '/assets/docs/engagement-one-pager.pdf', size: '4.3 KB' }]
  }
];

/* ── THE DESKTOP ──────────────────────────────────────────
   TODO(Quentin): swap in your real research and inspirations.

   Item kinds:
     'pdf'  → downloads (href)
     'link' → opens in a new tab (href)
     'note' → opens a text window (body: array of paragraphs)
   ────────────────────────────────────────────────────────── */
window.QD_DESKTOP = [
  /* Emptied deliberately. Quentin is writing the real contents.
     Item shapes, for reference when adding them back:
       { name, kind: 'page',  href: '/research/<slug>/', meta: '6 min read', tag: 'Book' }   // tag is optional: Book, Article…
       { name, kind: 'pdf',   href: '/assets/docs/<file>.pdf', meta: 'PDF · 240 KB' }
       { name, kind: 'link',  href: 'https://…', meta: 'Author' }
       { name, kind: 'note',  meta: 'Note', body: ['para', 'para'] }
       { name, kind: 'video', href: '/assets/video/x.mp4', poster: '…', body: [] }
     A folder with no items renders as an empty window rather than breaking,
     and /admin can fill any of this without a deploy. */
  { id: 'research',    name: 'Research',    kind: 'folder', items: [
      { name: 'From ranking to reasoning', kind: 'page', tag: 'Article', href: '/research/from-ranking-to-reasoning/', meta: '12 min read' },
      { name: 'The Value Proposition Canvas', kind: 'page', tag: 'Framework', href: '/research/value-proposition-canvas/', meta: '7 min read' },
      { name: 'Selling the work \u2014 on Sequoia\u2019s services thesis', kind: 'page', tag: 'Article', href: '/research/services-the-new-software/', meta: '8 min read' },
      { name: 'Business Model Generation \u2014 Osterwalder & Pigneur', kind: 'page', tag: 'Book', href: '/research/business-model-generation/', meta: '9 min read' },
      { name: 'Influence \u2014 Robert Cialdini', kind: 'page', tag: 'Book', href: '/research/influence-robert-cialdini/', meta: '10 min read' },
      { name: 'Hooked \u2014 Nir Eyal',           kind: 'page', tag: 'Book', href: '/research/hooked-nir-eyal/',           meta: '9 min read' }
    ] },
  { id: 'downloads',   name: 'Downloads',   kind: 'folder', items: [] },
  { id: 'inspiration', name: 'Inspiration', kind: 'folder', items: [
      { name: 'Why the Lean Start-Up Changes Everything', kind: 'link', tag: 'Article', href: 'https://hbr.org/2013/05/why-the-lean-start-up-changes-everything', meta: 'Steve Blank \u00b7 HBR, May 2013' }
    ] },
  { id: 'about',       name: 'About me',    kind: 'folder', items: [] }
];
