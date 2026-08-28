#!/usr/bin/env python3
"""
Tell IndexNow what changed.

  python3 tools/indexnow.py --dry-run          # show what would be sent
  python3 tools/indexnow.py                    # submit every sitemap URL
  python3 tools/indexnow.py --urls A B         # submit specific URLs
  python3 tools/indexnow.py --withdrawn        # submit the 410'd pieces

IndexNow is a push: instead of waiting for Bing, Yandex and the others to come
back on their own schedule, one POST tells them a URL changed. Google does not
participate, so this complements Search Console rather than replacing it.

Submitting a URL that now returns 410 is not a mistake — it is the fastest way
to get a withdrawn page dropped, because the crawler comes to check and finds
the gone status rather than waiting weeks to re-crawl on its own.

The key is verified by fetching KEY.txt from the site root, so the key file has
to be deployed before any of this works.
"""

import argparse
import json
import re
import shutil
import subprocess
import sys

HOST = 'quentindupard.com'
KEY = 'c269fe0f232f4c0b98944cadd64fdb68'
KEY_LOCATION = f'https://{HOST}/{KEY}.txt'
ENDPOINT = 'https://api.indexnow.org/IndexNow'

# Withdrawn 2026-08. Submitted so the 410 is seen rather than waited out.
WITHDRAWN_SLUGS = ['pricing-metric', 'activation', 'positioning',
                   'expansion-revenue', 'rising-cac', 'what-to-kill']
LOCALES = ['', '/fr', '/es']


CURL = shutil.which('curl')


def http(url, data=None, headers=()):
    """
    Fetch or POST through curl.

    Not urllib: the python.org macOS builds ship without a CA bundle unless
    someone has run Install Certificates.command, and this failing on a machine
    where every other request works would be a confusing way to lose a
    submission. curl is present on macOS and Linux and uses the system trust
    store.
    """
    if not CURL:
        raise RuntimeError('curl not found; install it or run this elsewhere')
    cmd = [CURL, '-sS', '--max-time', '30', '-w', '\n%{http_code}']
    for h in headers:
        cmd += ['-H', h]
    if data is not None:
        cmd += ['--data-binary', data]
    cmd.append(url)
    out = subprocess.run(cmd, capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip() or f'curl exit {out.returncode}')
    body, _, code = out.stdout.rpartition('\n')
    return int(code.strip() or 0), body


def sitemap_urls():
    status, xml = http(f'https://{HOST}/sitemap.xml')
    if status != 200:
        raise RuntimeError(f'sitemap returned HTTP {status}')
    return re.findall(r'<loc>([^<]+)</loc>', xml)


def withdrawn_urls():
    return [f'https://{HOST}{loc}/research/{slug}/'
            for loc in LOCALES for slug in WITHDRAWN_SLUGS]


def check_key():
    """The endpoint rejects everything if the key file is not reachable."""
    try:
        status, body = http(KEY_LOCATION)
    except Exception as e:
        return f'key file unreachable: {e}'
    if status != 200:
        return f'key file returned HTTP {status} — deploy it before submitting'
    if body.strip() != KEY:
        return f'key file serves {body.strip()[:40]!r}, expected the key itself'
    return None


def submit(urls):
    payload = json.dumps({
        'host': HOST,
        'key': KEY,
        'keyLocation': KEY_LOCATION,
        'urlList': urls,
    })
    return http(ENDPOINT, data=payload,
                headers=['Content-Type: application/json; charset=utf-8'])


MEANING = {
    200: 'accepted',
    202: 'accepted, key validation pending',
    400: 'bad request — malformed payload',
    403: 'key not valid for this host (is the key file deployed?)',
    422: 'a URL does not belong to this host, or the key does not match',
    429: 'too many requests — slow down',
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--withdrawn', action='store_true',
                    help='submit the removed research URLs so the 410 is seen')
    ap.add_argument('--urls', nargs='*', help='submit these URLs instead')
    a = ap.parse_args()

    if a.urls:
        urls = a.urls
    elif a.withdrawn:
        urls = withdrawn_urls()
    else:
        urls = sitemap_urls()

    bad = [u for u in urls if not u.startswith(f'https://{HOST}/')]
    if bad:
        print('  refusing: not on this host ->', bad[:3])
        return 1

    print(f'  {len(urls)} URL(s):')
    for u in urls:
        print('   ', u)

    if a.dry_run:
        print('\n  dry run, nothing sent')
        return 0

    problem = check_key()
    if problem:
        print(f'\n  {problem}')
        return 1
    print(f'\n  key verified at {KEY_LOCATION}')

    status, body = submit(urls)
    print(f'  POST {ENDPOINT} -> {status} ({MEANING.get(status, "see body")})')
    if body.strip():
        print(f'  {body.strip()}')
    return 0 if status in (200, 202) else 1


if __name__ == '__main__':
    sys.exit(main())
