#!/usr/bin/env python3
"""
Generate the localised site from i18n/<locale>.json.

  python3 tools/i18n/build.py            # all locales
  python3 tools/i18n/build.py fr         # one locale

Writes /fr/... and /es/... as real files. They are committed, so the deploy
stays a static upload with no build step on Cloudflare's side, and a broken
translation tool can never take the live site down with it.

Untranslated strings fall back to English rather than to a blank, and are
counted in the report. A half-translated page is a worse page; an empty one is
a broken one.
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
import lib
from extract import PAGES, ROOT, ld_blocks, LD_TEXT_FIELDS

SITE = 'https://quentindupard.com'

LOCALES = {
    'en': {'name': 'English',  'html': 'en', 'og': 'en_GB', 'prefix': ''},
    'fr': {'name': 'Français', 'html': 'fr', 'og': 'fr_FR', 'prefix': '/fr'},
    'es': {'name': 'Español',  'html': 'es', 'og': 'es_ES', 'prefix': '/es'},
}

# Paths that are the same file for every language.
PASSTHROUGH = re.compile(
    r'^/(assets/|admin|favicon|apple-touch-icon|site\.webmanifest|robots\.txt'
    r'|sitemap\.xml|llms(-full)?\.txt|_headers|_redirects)')


def localise_path(path, prefix):
    if not prefix or not path.startswith('/') or path.startswith('//'):
        return path
    if PASSTHROUGH.match(path):
        return path
    return prefix + path


def localise_href(value, prefix):
    """Rewrite a same-site href, keeping any #fragment and ?query attached."""
    if not value or value.startswith(('http://', 'https://', 'mailto:', 'tel:', '#')):
        return value
    m = re.match(r'^([^?#]*)(.*)$', value)
    path, rest = m.group(1), m.group(2)
    if not path.startswith('/'):
        return value
    return localise_path(path, prefix) + rest


def rewrite_links(source, prefix):
    """href/src on same-site paths. src is asset-only here, so href does the work."""
    def sub(m):
        attr, quote, value = m.group(1), m.group(2), m.group(3)
        return f'{attr}={quote}{localise_href(value, prefix)}{quote}'
    return re.sub(r'\b(href)=(["\'])(/[^"\']*)\2', sub, source)


def alternates(page):
    """hreflang block. x-default points at English, which is the source."""
    url = page_url('en', page)
    out = [f'<link rel="alternate" hreflang="x-default" href="{url}">']
    for code, meta in LOCALES.items():
        out.append(f'<link rel="alternate" hreflang="{meta["html"]}" href="{page_url(code, page)}">')
    return '\n'.join(out)


def page_url(locale, page):
    path = '/' + page
    path = path.replace('/index.html', '/')
    if path == '/index.html' or path == '//':
        path = '/'
    if page == '404.html':
        path = '/404.html'
    prefix = LOCALES[locale]['prefix']
    return SITE + (prefix + path if prefix and not PASSTHROUGH.match(path) else path)


def translate_ld(source, table, prefix, locale, page, stats):
    """
    Translate prose inside schema.org blocks and point page URLs at this locale.

    `@id` values are treated in two ways. An id hanging off the site root
    (`/#quentin`) names an entity that is the same person or the same website in
    every language, so it stays stable &mdash; that is what holds the graph
    together across locales. An id hanging off a page path
    (`/research/x/#faq`) names something that only exists on that page, and the
    French page is a different page with different text, so it gets localised.
    Sharing one id between three different documents is a collision, not a graph.
    """
    def convert(node):
        if isinstance(node, dict):
            out = {}
            for k, v in node.items():
                if k in LD_TEXT_FIELDS and isinstance(v, str) and lib.is_translatable(v):
                    out[k] = lookup(v, table, stats)
                elif k in ('url', 'item', 'mainEntityOfPage') and isinstance(v, str) and v.startswith(SITE):
                    out[k] = SITE + localise_path(v[len(SITE):] or '/', prefix)
                elif k == '@id' and isinstance(v, str) and v.startswith(SITE):
                    path, _, frag = v[len(SITE):].partition('#')
                    out[k] = (v if path in ('', '/')
                              else SITE + localise_path(path, prefix) + ('#' + frag if frag else ''))
                elif k == 'inLanguage':
                    out[k] = LOCALES[locale]['html']
                else:
                    out[k] = convert(v)
            return out
        if isinstance(node, list):
            return [convert(v) for v in node]
        return node

    edits = []
    for start, end, parsed in ld_blocks(source):
        body = json.dumps(convert(parsed), ensure_ascii=False, indent=2)
        edits.append((start, end, '\n' + body + '\n'))

    for start, end, body in reversed(edits):
        source = source[:start] + body + source[end:]
    return source


def lookup(text, table, stats):
    norm = lib.normalise(text)
    key = lib.key_for(norm)
    hit = table.get(key)
    if hit:
        stats['translated'] += 1
        return hit
    stats['missing'] += 1
    stats['missing_keys'].add(key)
    return text


def switcher(locale, page, dock=False):
    """
    Language picker. Rendered per page so each link lands on the same page in
    the other language rather than dumping the visitor back on the homepage,
    which is the single most common way a language switcher is annoying.
    """
    items = []
    for code, meta in LOCALES.items():
        href = page_url(code, page).replace(SITE, '') or '/'
        if code == locale:
            items.append(
                f'<span class="lang-opt is-on" aria-current="true">{meta["html"].upper()}</span>')
        else:
            items.append(
                f'<a class="lang-opt" href="{href}" hreflang="{meta["html"]}" '
                f'lang="{meta["html"]}" data-track="lang_switch" '
                f'data-track-label="{code}">{meta["html"].upper()}</a>')
    if dock:
        return ('<div class="lang-switch" data-lang-dock role="group" aria-labelledby="lang-label">'
                + ''.join(items) + '</div>')
    return ('<div class="lang-switch" role="group" aria-label="Language">'
            + ''.join(items) + '</div>')



def unwrap_nav_end(src):
    """
    Remove a <div class="nav-end"> wrapper, keeping its contents.

    Balanced scan rather than a regex: the wrapper contains the language
    switcher, which is itself a div, and a non-greedy match to the first
    </div> closes on the wrong tag and leaves mangled markup behind. The
    English pass writes back over its own source, so a wrapper produced by an
    earlier run is the input to the next one and this has to be exact.
    """
    open_tag = '<div class="nav-end">'
    while True:
        start = src.find(open_tag)
        if start < 0:
            return src
        depth, i = 1, start + len(open_tag)
        while depth and i < len(src):
            nxt_open = src.find('<div', i)
            nxt_close = src.find('</div>', i)
            if nxt_close < 0:
                return src                       # unbalanced; leave it alone
            if 0 <= nxt_open < nxt_close:
                depth += 1
                i = nxt_open + 4
            else:
                depth -= 1
                i = nxt_close + 6
        inner = src[start + len(open_tag): i - 6]
        src = src[:start] + inner + src[i:]


def build_page(page, locale, table):
    src = open(os.path.join(ROOT, page), encoding='utf-8').read()
    meta = LOCALES[locale]
    prefix = meta['prefix']
    stats = {'translated': 0, 'missing': 0, 'missing_keys': set()}

    if locale != 'en':
        spans = lib.collect(src)
        src = lib.apply_spans(src, spans, lambda kind, text: lookup(text, table, stats))
        src = translate_ld(src, table, prefix, locale, page, stats)
        src = rewrite_links(src, prefix)
        src = re.sub(r'<html lang="[^"]*"', f'<html lang="{meta["html"]}"', src, count=1)

    # Canonical + og:url must point at THIS locale, or the alternates contradict
    # the canonical and search engines pick one page for all three languages.
    url = page_url(locale, page)
    src = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{url}">', src, count=1)
    src = re.sub(r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{url}">', src, count=1)

    if 'og:locale' in src:
        src = re.sub(r'<meta property="og:locale" content="[^"]*">',
                     f'<meta property="og:locale" content="{meta["og"]}">', src, count=1)
    else:
        src = src.replace('<meta property="og:type"',
                          f'<meta property="og:locale" content="{meta["og"]}">\n<meta property="og:type"', 1)

    src = re.sub(r'\n<link rel="alternate" hreflang="[^"]*" href="[^"]*">', '', src)
    src = src.replace('<link rel="canonical"', alternates(page) + '\n<link rel="canonical"', 1)

    # Two homes for the language control. The homepage has the session dock,
    # where the theme and glass controls already live; every other page has no
    # dock, so it goes in the nav instead. Never both.
    src = unwrap_nav_end(src)
    src = re.sub(r'\s*<div class="lang-switch" role=.*?</div>', '', src, flags=re.S)

    dock = re.search(r'<div class="lang-switch" data-lang-dock[^>]*>.*?</div>', src, re.S)
    if dock:
        src = src[:dock.start()] + switcher(locale, page, dock=True) + src[dock.end():]

    # The CTA is wrapped on EVERY page, dock or not. The nav is three columns
    # whose outer two share a flex basis, so the links sit on the centre of the
    # nav rather than on whatever the brand and buttons leave over. Leaving the
    # CTA bare on the homepage made the brand column stretch instead.
    src = re.sub(r'(<a[^>]*class="[^"]*nav-cta[^"]*"[^>]*>.*?</a>)',
                 lambda m: '<div class="nav-end">'
                           + ('' if dock else switcher(locale, page))
                           + m.group(1) + '</div>',
                 src, count=1, flags=re.S)

    return src, stats


def main():
    only = sys.argv[1:] or [c for c in LOCALES if c != 'en']
    grand = {}

    for locale in ['en'] + [c for c in only if c != 'en']:
        table = {}
        if locale != 'en':
            raw = lib.load(os.path.join(ROOT, 'i18n', f'{locale}.json'), {})
            table = {k: v for k, v in raw.items() if isinstance(v, str) and v.strip()}

        totals = {'translated': 0, 'missing': 0, 'missing_keys': set()}
        for page in PAGES:
            if not os.path.exists(os.path.join(ROOT, page)):
                continue
            out, stats = build_page(page, locale, table)
            totals['translated'] += stats['translated']
            totals['missing'] += stats['missing']
            totals['missing_keys'] |= stats['missing_keys']

            dest = os.path.join(ROOT, LOCALES[locale]['prefix'].lstrip('/'), page) \
                if locale != 'en' else os.path.join(ROOT, page)
            os.makedirs(os.path.dirname(dest) or ROOT, exist_ok=True)
            with open(dest, 'w', encoding='utf-8') as fh:
                fh.write(out)

        grand[locale] = totals
        done = totals['translated']
        miss = totals['missing']
        pct = 100.0 * done / max(1, done + miss)
        label = 'source' if locale == 'en' else f'{pct:.0f}% translated'
        print(f'  {locale}: {len(PAGES)} pages, {done} strings, {miss} falling back to English  ({label})')

    if any(g['missing_keys'] for k, g in grand.items() if k != 'en'):
        missing = sorted(set().union(*[g['missing_keys'] for k, g in grand.items() if k != 'en']))
        lib.save(os.path.join(ROOT, 'i18n', 'missing.json'),
                 {'count': len(missing), 'keys': missing})
        print(f'  {len(missing)} untranslated keys listed in i18n/missing.json')


if __name__ == '__main__':
    main()
