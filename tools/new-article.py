#!/usr/bin/env python3
"""
Scaffold a research article.

  python3 tools/new-article.py pricing-metric \
      --title "Your pricing metric matters more than your price" \
      --kind Pricing --minutes 6

Writes research/<slug>/index.html from the same shape the previous articles
used — Article + BreadcrumbList + FAQPage schema, hreflang, the shared nav and
footer — registers the slug so the sitemap and the translation build pick it
up, and adds a card to the hub.

The prose is left as marked placeholders. That is deliberate: the point of the
scaffold is that everything AROUND the writing is already correct, so a piece
can be published by writing it rather than by remembering fourteen structural
details.

After writing the prose:
    python3 tools/i18n/extract.py     # new strings into the catalogue
    # translate them, then
    python3 tools/i18n/build.py
    python3 tools/i18n/sitemap.py
    python3 tools/i18n/verify.py
"""

import argparse
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://quentindupard.com'

TEMPLATE_SOURCE = os.path.join(ROOT, 'research', 'index.html')


def head_and_chrome():
    """Lift the nav, footer and script tags from the hub so a new article can
       never drift from the rest of the site."""
    src = open(TEMPLATE_SOURCE, encoding='utf-8').read()
    nav = re.search(r'(<nav class="nav.*?</nav>)', src, re.S).group(1)
    # The build rewrites the switcher anyway; strip it so it is not duplicated.
    nav = re.sub(r'\s*<div class="lang-switch".*?</div>', '', nav, flags=re.S)
    nav = re.sub(r'<div class="nav-end">(.*?)</div>\s*</nav>', r'\1\n</nav>', nav, flags=re.S)
    footer = re.search(r'(<footer class="site-footer".*?</footer>)', src, re.S).group(1)
    scripts = re.findall(r'<script src="[^"]+" defer></script>', src)
    icons = re.search(r'(<link rel="icon".*?<meta name="theme-color"[^>]*>)', src, re.S).group(1)
    theme = re.search(r'(<script>\s*/\* Theme before first paint.*?</script>)', src, re.S).group(1)
    defs = re.search(r'(<svg class="svg-defs".*?</svg>)', src, re.S).group(1)
    return nav, footer, scripts, icons, theme, defs


def article_schema(slug, title, summary, url):
    return f"""{main_schema}"""


def book_schema(title, summary, url, book_title, author, isbn):
    """
    A book write-up is a Review of a Book, not an Article about one.

    Review with itemReviewed states the relationship — this person read that
    book and has a view — which is what earns a review rich result. No rating
    is emitted: a number out of five says less than the paragraph explaining
    what the book got right, and inventing one would be worse than none.
    """
    isbn_line = f'\n    "isbn": "{isbn}",' if isbn else ''
    return f"""<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "Review",
  "name": "{title}",
  "description": "{summary}",
  "url": "{url}",
  "datePublished": "TODO-YYYY-MM-DD",
  "author": {{ "@id": "{SITE}/#quentin" }},
  "publisher": {{ "@id": "{SITE}/#quentin" }},
  "inLanguage": "en",
  "itemReviewed": {{
    "@type": "Book",
    "name": "{book_title}",{isbn_line}
    "author": {{ "@type": "Person", "name": "{author}" }}
  }}
}}
</script>"""


def build(slug, title, kind, minutes, summary, book=None, author=None, isbn=None):
    nav, footer, scripts, icons, theme, defs = head_and_chrome()
    url = f'{SITE}/research/{slug}/'
    main_schema = (book_schema(title, summary, url, book, author or 'TODO author', isbn)
                   if book else article_schema(slug, title, summary, url))

    if book:
        body = (
            f'      <p class="stand-first">TODO what this book got right that '
            f'other people get wrong, in one paragraph. This is the quotable bit '
            f'— it has to stand alone.</p>\n\n'
            f'      <p class="book-meta"><strong>{book}</strong> &mdash; {author or "TODO author"}</p>\n\n'
            f'      <h2>What it argues</h2>\n\n'
            f'      <p>TODO the book\'s actual claim, stated fairly enough that '
            f'someone who disagrees would recognise it.</p>\n\n'
            f'      <h2>What I took from it</h2>\n\n'
            f'      <p>TODO the part that changed how you work. Specific, from a '
            f'real engagement if you have one.</p>\n\n'
            f'      <h2>Where it is wrong, or dated</h2>\n\n'
            f'      <p>TODO. A review with no disagreement in it reads as a '
            f'blurb, and nobody trusts a blurb.</p>\n\n'
            f'      <h2>Who should read it</h2>\n\n'
            f'      <p>TODO, and who should not.</p>')
    else:
        body = (
            '      <p class="stand-first">TODO one paragraph that states the claim. '
            'This is what shows in search results and what an answer engine quotes, '
            'so it has to stand alone.</p>\n\n'
            '      <p>TODO the argument.</p>\n\n'
            '      <h2>TODO section heading</h2>\n\n'
            '      <p>TODO.</p>')

    page = f'''<!DOCTYPE html>
<html lang="en" class="no-js">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">

<title>{title} | Quentin Dupard</title>
<meta name="description" content="{summary}">
<meta name="author" content="Quentin Dupard">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<link rel="canonical" href="{url}">
<link rel="alternate" type="text/markdown" href="/llms.txt" title="LLM-friendly site summary">

<meta property="og:type" content="article">
<meta property="og:site_name" content="Quentin Dupard">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{summary}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/assets/research/{slug}.svg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{summary}">

{icons}

<link rel="stylesheet" href="/assets/glass.css?v=29">
<link rel="stylesheet" href="/assets/home.css?v=42">
<link rel="stylesheet" href="/assets/article.css?v=5">

<script>document.documentElement.classList.remove('no-js');</script>

{theme}

{main_schema}

<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {{ "@type": "ListItem", "position": 1, "name": "Home", "item": "{SITE}/" }},
    {{ "@type": "ListItem", "position": 2, "name": "Research", "item": "{SITE}/research/" }},
    {{ "@type": "ListItem", "position": 3, "name": "{title}", "item": "{url}" }}
  ]
}}
</script>

<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "{url}#faq",
  "mainEntity": [
    {{
      "@type": "Question",
      "name": "TODO first question",
      "acceptedAnswer": {{ "@type": "Answer", "text": "TODO answer, matching the visible FAQ below word for word." }}
    }}
  ]
}}
</script>
</head>
<body>

{defs}

<div class="mesh" aria-hidden="true"></div>
<div class="rail" id="rail" aria-hidden="true"></div>

{nav}

<main>
<article>
<header class="article-hero">
  <div class="shell">
    <a class="crumb" href="/research/">&larr; Research</a>
    <h1>{title}</h1>
    <div class="article-meta">
      <span>{kind}</span>
      <span>{minutes} min read</span>
      <span>Quentin Dupard</span>
      <span>Updated TODO Month YYYY</span>
    </div>
  </div>
</header>

<section style="padding-top:24px;">
  <div class="shell">
    <div class="prose">

      <figure class="article-figure">
        <img src="/assets/research/{slug}.svg" alt="" width="1200" height="630" loading="lazy" decoding="async">
      </figure>

{body}

      <div class="callout">
        <p>TODO the one line worth remembering.</p>
      </div>

      <h2>Common questions</h2>

      <div class="faq-inline">
        <details class="glass faq-item" data-track="faq_open">
          <summary>TODO first question</summary>
          <p>TODO answer, matching the FAQPage schema above word for word.</p>
        </details>
      </div>

    </div>
  </div>
</section>
</article>
</main>

{footer}

{chr(10).join(scripts)}
</body>
</html>
'''
    dest_dir = os.path.join(ROOT, 'research', slug)
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, 'index.html')
    if os.path.exists(dest):
        print(f'  refusing to overwrite {dest}')
        return 1
    open(dest, 'w', encoding='utf-8').write(page)
    print(f'  wrote research/{slug}/index.html')

    register(slug)
    add_hub_card(slug, title, kind, summary)
    print('\n  next: write the prose, replace every TODO, then')
    print('    python3 tools/i18n/extract.py && python3 tools/i18n/build.py')
    print('    python3 tools/i18n/sitemap.py && python3 tools/i18n/verify.py')
    return 0


def register(slug):
    """Add the page to the translation and sitemap page list."""
    p = os.path.join(ROOT, 'tools', 'i18n', 'extract.py')
    s = open(p, encoding='utf-8').read()
    entry = f"    'research/{slug}/index.html',\n"
    if entry in s:
        return
    anchor = "    'research/index.html',\n"
    s = s.replace(anchor, anchor + entry, 1)
    open(p, 'w', encoding='utf-8').write(s)
    print(f'  registered in tools/i18n/extract.py')


def add_hub_card(slug, title, kind, summary):
    p = os.path.join(ROOT, 'research', 'index.html')
    s = open(p, encoding='utf-8').read()
    card = f'''        <a class="glass hub-card reveal" data-reveal="scale" href="/research/{slug}/">
          <span class="hub-thumb"><img src="/assets/research/{slug}.svg" alt="" loading="lazy" decoding="async" width="1200" height="630"></span>
          <span class="hub-kind">{kind}</span>
          <h2>{title}</h2>
          <p>{summary}</p>
          <span class="hub-go">Read &rarr;</span>
        </a>
'''
    if '<div class="hub-grid">' in s:
        s = s.replace('<div class="hub-grid">', '<div class="hub-grid">\n' + card.rstrip('\n'), 1)
    else:
        # First article: the hub is still showing its empty state.
        start = s.index('      <div class="hub-empty glass">')
        end = s.index('</div>', s.index('</p>', s.rindex('<p><a class="btn'))) + len('</div>')
        s = s[:start] + '      <div class="hub-grid">\n' + card + '      </div>' + s[end:]
    open(p, 'w', encoding='utf-8').write(s)
    print('  added a card to research/index.html')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('slug')
    ap.add_argument('--title', required=True)
    ap.add_argument('--kind', default='Research', help='Pricing, Activation, Positioning…')
    ap.add_argument('--minutes', default='5')
    ap.add_argument('--summary', default='TODO one sentence, used in search results and on the hub card.')
    ap.add_argument('--book', help='book title — switches the schema to a Review of a Book')
    ap.add_argument('--author', help='the book\'s author')
    ap.add_argument('--isbn', help='optional, but it is what disambiguates an edition')
    a = ap.parse_args()
    if not re.fullmatch(r'[a-z0-9-]+', a.slug):
        print('  slug must be lowercase letters, digits and hyphens')
        return 1
    return build(a.slug, a.title, a.kind, a.minutes, a.summary,
                 book=a.book, author=a.author, isbn=a.isbn)


if __name__ == '__main__':
    sys.exit(main())
