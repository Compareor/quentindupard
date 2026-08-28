#!/usr/bin/env python3
"""
Stamp every page with the same asset versions.

  python3 tools/bump.py           # report drift
  python3 tools/bump.py --apply   # set every page to the highest seen

Versions were being bumped with `grep -l 'x.js?v=N' | xargs sed`, which only
touches pages already at N. Any page that missed one bump silently stopped
receiving every later one, and pages ended up loading different CSS from each
other. Highest-wins here, applied everywhere, so that cannot recur.
"""
import glob, re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAT = re.compile(r'(/assets/[a-z0-9-]+\.(?:js|css))\?v=(\d+)')


def pages():
    out = []
    for pattern in ('*.html', '*/index.html', '*/*/index.html', '*/*/*/index.html'):
        out += glob.glob(os.path.join(ROOT, pattern))
    return sorted(set(out))


def main():
    apply = '--apply' in sys.argv
    best = {}
    for f in pages():
        for asset, v in PAT.findall(open(f, encoding='utf-8').read()):
            best[asset] = max(best.get(asset, 0), int(v))

    drift = 0
    for f in pages():
        s = open(f, encoding='utf-8').read()
        new = PAT.sub(lambda m: f'{m.group(1)}?v={best[m.group(1)]}', s)
        if new != s:
            drift += 1
            rel = os.path.relpath(f, ROOT)
            stale = {a: v for a, v in PAT.findall(s) if int(v) != best[a]}
            print(f'  {rel}: ' + ', '.join(f'{a.split("/")[-1]} v{v}->v{best[a]}' for a, v in stale.items()))
            if apply:
                open(f, 'w', encoding='utf-8').write(new)

    print(f'\n  canonical: ' + ', '.join(f'{a.split("/")[-1]}={v}' for a, v in sorted(best.items())))
    if drift and not apply:
        print(f'  {drift} page(s) behind. Re-run with --apply.')
        return 1
    print(f'  {"fixed" if drift else "no drift"}: {drift} page(s)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
