#!/usr/bin/env python3
"""
Merge translations into i18n/<locale>.json.

  python3 tools/i18n/apply.py fr batch.json

`batch.json` is { "<english source>": "<translation>" }, keyed by the English
itself so translations can be written without ever touching a hash. Anything
whose English no longer appears in the catalogue is reported rather than
merged, which catches a typo in the source side of a pair instead of silently
storing a translation that can never be looked up.

Inline markup is checked: a translation must carry the same tags as its
source, or the built page loses a link.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import lib

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    locale, batch_path = sys.argv[1], sys.argv[2]

    catalogue = lib.load(os.path.join(ROOT, 'i18n', 'en.json'))
    target_path = os.path.join(ROOT, 'i18n', f'{locale}.json')
    target = lib.load(target_path, {})
    batch = lib.load(batch_path)

    added = updated = 0
    unknown, broken = [], []

    for english, translated in batch.items():
        norm = lib.normalise(english)
        key = lib.key_for(norm)
        if key not in catalogue:
            unknown.append(english)
            continue
        want = lib.tag_signature(norm)
        got = lib.tag_signature(lib.normalise(translated))
        if want != got:
            broken.append((english, sorted((want - got).elements()), sorted((got - want).elements())))
            continue
        if key in target:
            updated += 1 if target[key] != translated else 0
        else:
            added += 1
        target[key] = translated

    lib.save(target_path, target)

    total = len(catalogue)
    have = sum(1 for k in catalogue if target.get(k))
    print(f'  {locale}: +{added} new, {updated} changed  ->  {have}/{total} ({100*have//max(1,total)}%)')

    for english in unknown:
        print(f'  ! not in catalogue: {english[:90]!r}')
    for english, missing, extra in broken:
        print(f'  ! markup mismatch: {english[:60]!r} missing={missing} extra={extra}')

    return 1 if (unknown or broken) else 0


if __name__ == '__main__':
    sys.exit(main())
