#!/usr/bin/env python3
"""
Stamp dateModified on every article's Article/Review schema from git.

  python3 tools/stamp-modified.py

Same idea as the sitemap's lastmod: the date comes from the last commit
that touched the English source (or today, if the file has uncommitted
edits), so nobody has to remember to bump it by hand. Run before a commit
that edits an article; the i18n build carries it into fr/ and es/.
"""
import glob, json, os, re, subprocess, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def lastmod(path):
    dirty = subprocess.run(['git', 'diff', '--quiet', 'HEAD', '--', path],
                           cwd=ROOT).returncode != 0
    if dirty:
        return datetime.date.today().isoformat()
    out = subprocess.run(['git', 'log', '-1', '--format=%cs', '--', path],
                         cwd=ROOT, capture_output=True, text=True).stdout.strip()
    return out or datetime.date.today().isoformat()

def main():
    for path in sorted(glob.glob(os.path.join(ROOT, 'research', '*', 'index.html'))):
        rel = os.path.relpath(path, ROOT)
        s = open(path, encoding='utf-8').read()
        changed = False
        for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
            try:
                d = json.loads(m.group(1))
            except ValueError:
                continue
            nodes = d.get('@graph', [d])
            arts = [n for n in nodes if n.get('@type') in ('Article', 'Review')]
            if not any('datePublished' in n for n in arts):
                continue
            date = lastmod(rel)
            for n in arts:
                if 'datePublished' in n and n.get('dateModified') != date:
                    keyed = {}
                    for k, v in n.items():
                        keyed[k] = v
                        if k == 'datePublished':
                            keyed['dateModified'] = date
                    n.pop('dateModified', None)
                    n.clear(); n.update(keyed)
                    changed = True
            if changed:
                block = ('<script type="application/ld+json">\n'
                         + json.dumps(d, indent=2, ensure_ascii=False) + '\n</script>')
                s = s[:m.start()] + block + s[m.end():]
        if changed:
            open(path, 'w', encoding='utf-8').write(s)
        print(f'  {rel}: dateModified {lastmod(rel)}' + ('' if changed else '  (unchanged)'))

if __name__ == '__main__':
    main()
