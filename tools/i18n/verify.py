#!/usr/bin/env python3
"""
Check the published translations hang together.

  python3 tools/i18n/verify.py

hreflang fails silently. Google treats the annotations as a set of mutual
claims: if /fr/about/ names /about/ as its English twin, /about/ has to name
/fr/about/ back, and both URLs have to exist. When that breaks, nothing errors
— one arbitrary language gets indexed and the other two quietly do not. So
every check here is about catching that before a crawler does.

Pages marked noindex are skipped: annotating a page that will never be indexed
in any language is noise, not correctness.
"""

import glob
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from build import LOCALES, SITE
from extract import ROOT

SKIP_DIRS = ('admin/',)


def local_path(url):
    """Map a site URL back to the file that has to exist for it."""
    path = url[len(SITE):] if url.startswith(SITE) else url
    path = path.split('#')[0].split('?')[0]
    if path.endswith('/'):
        path += 'index.html'
    return os.path.join(ROOT, path.lstrip('/'))


def main():
    files = sorted(set(
        glob.glob('*.html') +
        glob.glob('*/*.html') +
        glob.glob('*/*/*.html') +
        glob.glob('*/*/*/*.html')
    ))

    problems = []
    checked = 0
    claims = {}          # url -> set of urls it claims as alternates

    for f in files:
        if any(f.startswith(d) for d in SKIP_DIRS):
            continue
        src = open(os.path.join(ROOT, f), encoding='utf-8').read()

        robots = re.search(r'<meta name="robots" content="([^"]*)"', src)
        if robots and 'noindex' in robots.group(1):
            continue
        checked += 1

        lang = re.search(r'<html lang="([^"]+)"', src)
        canon = re.search(r'<link rel="canonical" href="([^"]+)"', src)
        alts = re.findall(
            r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"', src)
        by_lang = dict(alts)

        expected_lang = 'en'
        for code, meta in LOCALES.items():
            if code != 'en' and f.startswith(meta['prefix'].lstrip('/') + '/'):
                expected_lang = code
        if not lang or lang.group(1) != LOCALES[expected_lang]['html']:
            problems.append(f'{f}: <html lang> is {lang.group(1) if lang else "missing"}, '
                            f'expected {LOCALES[expected_lang]["html"]}')

        if not canon:
            problems.append(f'{f}: no canonical')
            continue

        missing = {LOCALES[c]['html'] for c in LOCALES} | {'x-default'}
        missing -= set(by_lang)
        if missing:
            problems.append(f'{f}: hreflang missing {sorted(missing)}')

        if canon.group(1) not in by_lang.values():
            problems.append(f'{f}: canonical {canon.group(1)} is not among its own alternates')

        for code, url in alts:
            target = local_path(url)
            if not os.path.exists(target):
                problems.append(f'{f}: hreflang="{code}" points at {url}, which does not exist')

        claims[canon.group(1)] = {u for _, u in alts if not u.endswith('x-default')}

    # Reciprocity: everyone A names must name A back.
    for url, named in claims.items():
        for other in named:
            if other == url:
                continue
            if other in claims and url not in claims[other]:
                problems.append(f'{other} does not name {url} back (hreflang must be mutual)')

    print(f'  {checked} indexable pages checked across {len(LOCALES)} languages')
    for p in problems:
        print(f'  FAIL {p}')
    print('  ' + ('ALL CHECKS PASS' if not problems else f'{len(problems)} PROBLEM(S)'))
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
