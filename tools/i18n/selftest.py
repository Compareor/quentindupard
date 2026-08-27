#!/usr/bin/env python3
"""
Round-trip guard.

Rewriting with an identity replacement must reproduce every source file byte
for byte. If it does not, the offsets are wrong and every generated page is
suspect, so this runs before any build.
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import lib
from extract import PAGES, ROOT

fail = 0
for page in PAGES:
    path = os.path.join(ROOT, page)
    if not os.path.exists(path):
        continue
    src = open(path, encoding='utf-8').read()
    spans = lib.collect(src)
    out = lib.apply_spans(src, spans, lambda kind, text: text)
    if out != src:
        fail += 1
        for i, (a, b) in enumerate(zip(src, out)):
            if a != b:
                print(f'  FAIL {page}: first difference at byte {i}')
                print(f'    src: {src[max(0,i-60):i+60]!r}')
                print(f'    out: {out[max(0,i-60):i+60]!r}')
                break
        else:
            print(f'  FAIL {page}: length {len(src)} -> {len(out)}')
    else:
        print(f'  ok  {page}  ({len(spans)} spans, byte-identical)')

print('\n  ROUND TRIP: ' + ('PASS' if not fail else f'{fail} FILE(S) FAILED'))
sys.exit(1 if fail else 0)
