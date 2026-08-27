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

    `@id` values are deliberately left alone. They are entity identifiers, not
    addresses: the same person and the same website in every language, so
    keeping them stable is what holds the graph together across locales.
    """
    def convert(node):
        if isinstance(node, dict):
            out = {}
            for k, v in node.items():
                if k in LD_TEXT_FIELDS and isinstance(v, str) and lib.is_translatable(v):
                    out[k] = lookup(v, table, stats)
                elif k in ('url', 'item', 'mainEntityOfPage') and isinstance(v, str) and v.startswith(SITE):
                    out[k] = SITE + localise_path(v[len(SITE):] or '/', prefix)
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
    # where the theme and glass controls already live and where the reader is
    # told to look; every other page has no dock, so it goes in the nav
    # instead. Never both, because two pickers on one page is a bug report.
    #
    # The nav variant is stripped unconditionally before deciding. The English
    # pass writes back over its own source, so a switcher left by an earlier
    # run is part of the input to the next one.
    src = re.sub(r'\s*<div class="lang-switch" role=.*?</div>', '', src, flags=re.S)

    dock = re.search(r'<div class="lang-switch" data-lang-dock[^>]*>.*?</div>', src, re.S)
    if dock:
        src = src[:dock.start()] + switcher(locale, page, dock=True) + src[dock.end():]
    else:
        src = re.sub(r'(<a[^>]*class="[^"]*nav-cta[^"]*")',
                     switcher(locale, page) + r'\n  \1', src, count=1)

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
