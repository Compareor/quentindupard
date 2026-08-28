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
  {
    id: 'research',
    name: 'Research',
    kind: 'folder',
    items: [
      { name: 'Your pricing metric matters more than your price', kind: 'page', href: '/research/pricing-metric/', meta: '6 min read' },
      { name: 'Why your activation is flat', kind: 'page', href: '/research/activation/', meta: '5 min read' },
      { name: 'The three-company test for positioning', kind: 'page', href: '/research/positioning/', meta: '5 min read' },
      { name: 'All research', kind: 'page', href: '/research/', meta: 'Index' }
    ]
  },
  {
    id: 'downloads',
    name: 'Downloads',
    kind: 'folder',
    items: [
      { name: 'Pricing Teardown.pdf', kind: 'pdf', href: '/assets/docs/pricing-teardown-sample.pdf', meta: '4.9 KB' },
      { name: 'Activation Audit.pdf', kind: 'pdf', href: '/assets/docs/activation-audit-sample.pdf', meta: '4.5 KB' },
      { name: 'How I Work.pdf', kind: 'pdf', href: '/assets/docs/engagement-one-pager.pdf', meta: '4.3 KB' }
    ]
  },
  {
    id: 'frameworks',
    name: 'Frameworks',
    kind: 'folder',
    items: [
      {
        name: 'The compounding test.txt', kind: 'note', meta: 'Note',
        body: [
          'As a customer succeeds wildly with your product, does your invoice grow?',
          'If not, you have built a business that must keep winning new logos just to stand still. Every pricing decision downstream of this one is cosmetic.',
          'This single question sorts pricing models faster than any framework I know.'
        ]
      },
      {
        name: 'Positioning smell test.txt', kind: 'note', meta: 'Note',
        body: [
          'If your homepage could describe three other businesses, positioning is your problem and nothing downstream will fix it.',
          'A positioning statement that excludes nobody is a description, not a position.',
          'Name what dies when they buy you. If you cannot, there is no budget line and the deal will stall at procurement.'
        ]
      },
      {
        name: 'Why deals really stall.txt', kind: 'note', meta: 'Note',
        body: [
          'Teams diagnose late-stage stalls as a closing problem. It is almost always a "why now" problem.',
          'Without urgency built into the product or the market, a rational buyer defers. Discounting a deferred decision just makes it a cheaper deferred decision.'
        ]
      }
    ]
  },
  {
    id: 'inspiration',
    name: 'Inspiration',
    kind: 'folder',
    items: [
      { name: 'The Only Thing That Matters', kind: 'link', href: 'https://pmarchive.com/guide_to_startups_part4.html', meta: 'Marc Andreessen' },
      { name: 'A Smart Bear — long form', kind: 'link', href: 'https://longform.asmartbear.com/', meta: 'Jason Cohen' },
      { name: 'Obviously Awesome (positioning)', kind: 'link', href: 'https://www.aprildunford.com/obviously-awesome', meta: 'April Dunford' },
      { name: 'Reforge — growth models', kind: 'link', href: 'https://www.reforge.com/', meta: 'Reference' }
    ]
  },
  {
    id: 'about',
    name: 'About me',
    kind: 'folder',
    items: [
      {
        name: 'Read me first.txt', kind: 'note', meta: 'Note',
        body: [
          'Independent product and marketing operator. I get called when revenue has stopped moving and the room cannot agree on why.',
          'It is almost always one of three things: what you charge, how you explain yourself, or the gap between someone showing interest and actually paying. I have found the same three at the bottom of nearly every engagement, in businesses with nothing else in common — a grocery shop and a Series A software company have the same underlying problem.',
          'What people pay me for is ideas, not frameworks. The useful ones come from having sat in the product review and then on the sales call two hours later, and noticed the two rooms believe completely different things about the same customer. That gap is where the work is.',
          'I also build. Whole products, end to end: ecommerce, newsletters, internal tooling, operations automation. When the answer is something that does not exist yet, building it beats writing a specification and handing it over.',
          'What I will not do: pretend a problem is solvable with my services when it is not, or recommend a vendor I earn a commission on. I take none.',
          'Execution got cheap. Ideas did not.'
        ]
      },
      {
        /* Drop an MP4 at /assets/video/intro.mp4 and this appears. Until the
           file exists the entry is filtered out at render time, so a missing
           video is an absent row rather than a broken player. */
        name: 'Ninety seconds with me.mp4', kind: 'video', meta: 'Video',
        /* DELETE THIS LINE once the file is in place. Until then the row is
           filtered out, so the entry can sit here without a dead player. */
        missing: true,
        href: '/assets/video/intro.mp4',
        poster: '/assets/video/intro-poster.jpg',
        captions: '/assets/video/intro.vtt',
        body: [
          'Who I am, what I actually do, and how to tell whether I am the right person for your problem.'
        ]
      },
      { name: 'How I work.pdf', kind: 'pdf', href: '/assets/docs/engagement-one-pager.pdf', meta: 'PDF · 4.3 KB' },
      { name: 'LinkedIn', kind: 'link', href: 'https://www.linkedin.com/in/quentindupard/', meta: 'Profile' },
      { name: 'Book 30 minutes', kind: 'link', href: 'https://calendly.com/quentin-dupard-call/30min', meta: 'Calendar' }
    ]
  }
];
