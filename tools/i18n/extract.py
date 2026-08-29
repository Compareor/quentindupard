#!/usr/bin/env python3
"""
Pull every translatable string out of the English pages into i18n/en.json.

  python3 tools/i18n/extract.py

Safe to re-run. Existing keys keep their place; new English copy shows up as
new keys; copy that no longer appears anywhere is reported but not deleted,
because a string can vanish from a page for a release and come back.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import lib

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Source pages. /admin is a private tool and stays English.
PAGES = [
    'index.html',
    '404.html',
    'about/index.html',
    'privacy/index.html',
    'stats/index.html',
    'research/index.html',
    'research/services-the-new-software/index.html',
    'research/business-model-generation/index.html',
    'research/influence-robert-cialdini/index.html',
    'research/hooked-nir-eyal/index.html',
]

# Article pages are added here as they are written. tools/new-article.py
# appends automatically; nothing else needs editing to publish one.

# JSON-LD fields that carry prose rather than identifiers.
LD_TEXT_FIELDS = {'name', 'description', 'headline', 'text', 'articleBody',
                  'alternativeHeadline', 'jobTitle', 'caption'}


def walk_ld(node, out):
    """Collect prose out of a schema.org graph, wherever it is nested."""
    if isinstance(node, dict):
        for k, v in node.items():
            if k in LD_TEXT_FIELDS and isinstance(v, str) and lib.is_translatable(v):
                out.append(v)
            else:
                walk_ld(v, out)
    elif isinstance(node, list):
        for v in node:
            walk_ld(v, out)


def ld_blocks(source):
    """Yield (start, end, parsed) for each ld+json script body."""
    needle = 'application/ld+json'
    cursor = 0
    while True:
        i = source.find(needle, cursor)
        if i < 0:
            return
        body_start = source.index('>', i) + 1
        body_end = source.index('</script>', body_start)
        raw = source[body_start:body_end]
        try:
            yield body_start, body_end, json.loads(raw)
        except json.JSONDecodeError:
            pass
        cursor = body_end


def main():
    catalogue = lib.load(os.path.join(ROOT, 'i18n', 'en.json'), {})
    seen = {}

    for page in PAGES:
        path = os.path.join(ROOT, page)
        if not os.path.exists(path):
            print(f'  skip (missing): {page}')
            continue
        source = open(path, encoding='utf-8').read()

        strings = [text for _, _, _, text in lib.collect(source)]

        for _, _, parsed in ld_blocks(source):
            found = []
            walk_ld(parsed, found)
            strings.extend(found)

        for text in strings:
            norm = lib.normalise(text)
            if not lib.is_translatable(norm):
                continue
            key = lib.key_for(norm)
            entry = seen.setdefault(key, {'en': norm, 'pages': []})
            if page not in entry['pages']:
                entry['pages'].append(page)

    # Merge: keep any note a human added, refresh where the string appears.
    merged = {}
    for key, entry in seen.items():
        old = catalogue.get(key, {})
        merged[key] = {
            'en': entry['en'],
            'pages': sorted(entry['pages']),
        }
        if 'note' in old:
            merged[key]['note'] = old['note']

    retired = [k for k in catalogue if k not in merged]

    lib.save(os.path.join(ROOT, 'i18n', 'en.json'), merged)

    words = sum(len(e['en'].split()) for e in merged.values())
    print(f'  {len(merged)} strings, {words} words -> i18n/en.json')
    if retired:
        print(f'  {len(retired)} keys no longer appear on any page (left in place)')


if __name__ == '__main__':
    main()
