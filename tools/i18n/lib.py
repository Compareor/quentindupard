"""
Shared HTML surgery for the translation pipeline.

The site is hand-authored HTML with meaningful inline markup, so a
parse-and-reserialise round trip would reformat pages that nobody asked to
have reformatted. Instead this locates the exact source offsets of the pieces
that carry language and rewrites the original bytes in place. Anything the
extractor does not recognise comes through untouched, which is the property
that makes this safe to run over the whole site.

A key is a hash of the English text, gettext style. That has one deliberate
consequence: editing an English sentence changes its key, so its translations
fall out of the dictionary and are reported as missing rather than silently
going stale. Losing a translation loudly beats keeping a wrong one quietly.
"""

import hashlib
import json
import re
from html.parser import HTMLParser

# Text inside these never gets translated: code samples, machine data, and
# anything the parser should treat as opaque.
OPAQUE = {'script', 'style', 'code', 'pre', 'kbd', 'samp', 'var', 'svg'}

# Elements that flow inside a sentence. A translatable unit is captured WITH
# these still in it, because a sentence broken at every <a> extracts as
# fragments like ", and" and ", the" — and a fragment cannot be translated.
# French and Spanish reorder clauses, so the whole sentence has to travel
# together and the tags have to travel inside it.
INLINE = {
    'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'del',
    'dfn', 'em', 'i', 'ins', 'kbd', 'mark', 'q', 's', 'samp', 'small',
    'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr', 'svg', 'img',
    'picture', 'source', 'use', 'path', 'rect', 'circle', 'g', 'defs',
    'lineargradient', 'stop', 'polyline', 'line', 'ellipse', 'text', 'tspan',
}

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
        'meta', 'param', 'source', 'track', 'wbr'}

# Attributes that are read out loud or shown to a person.
TRANSLATABLE_ATTRS = {'alt', 'title', 'placeholder', 'aria-label', 'aria-placeholder'}

# <meta> pairs worth translating, matched on name/property.
META_KEYS = {
    'description', 'og:title', 'og:description', 'og:site_name',
    'twitter:title', 'twitter:description', 'apple-mobile-web-app-title'
}

# Strings that are the same word in every language, or are not words at all.
SKIP_EXACT = {
    '', '·', '—', '–', '&', '/', '|', '×', '✕', '↑', '↓', '←', '→',
    'Quentin Dupard', 'LinkedIn', 'Stripe', 'Calendly', 'Formspree', 'PDF',
    'AI-me', 'SaaS', 'B2B', 'CAC', 'GTM', 'NRR', 'Espresso', 'Sprint',
    'Operator', 'Custom', 'Free',
}


def key_for(text):
    return hashlib.sha1(text.encode('utf-8')).hexdigest()[:12]


def normalise(text):
    """Collapse whitespace so that reflowing the source does not orphan a key."""
    return re.sub(r'\s+', ' ', text).strip()


def is_translatable(text):
    t = normalise(text)
    if t in SKIP_EXACT:
        return False
    if not re.search(r'[A-Za-z]', t):        # digits, punctuation, symbols
        return False
    if len(t) < 2:
        return False
    return True


GENERATED_CLASSES = ('lang-switch', 'lang-opt')


def is_generated(attrs):
    """True for markup this pipeline writes rather than a person."""
    for name, value in attrs:
        if name == 'class' and value:
            classes = value.split()
            if any(c in GENERATED_CLASSES for c in classes):
                return True
        if name == 'data-lang-dock':
            return True
    return False


class _Node:
    __slots__ = ('tag', 'inner_start', 'inner_end', 'children', 'has_text', 'has_block')

    def __init__(self, tag, inner_start):
        self.tag = tag
        self.inner_start = inner_start
        self.inner_end = None
        self.children = []
        self.has_text = False
        self.has_block = False


class Collector(HTMLParser):
    """
    Finds translatable units against the ORIGINAL source.

    Two kinds of span come out:

      'block' — the inner source of an element whose descendants are all
                inline. The whole sentence, markup included.
      'attr'  — a translatable attribute value.

    html.parser reports line/column rather than offsets, so positions go
    through a line index. Attribute spans are located inside the tag's own
    source slice, which avoids matching an identical string that happens to
    appear elsewhere on the same line.
    """

    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.source = source
        self._line_starts = [0]
        for line in source.splitlines(keepends=True):
            self._line_starts.append(self._line_starts[-1] + len(line))
        self.spans = []
        self.blocks = []
        self._open = []
        self._opaque_depth = 0
        self._generated_depth = 0

    def _at(self, pos):
        """HTMLParser owns `offset` and `lineno`, so this is deliberately named."""
        line, col = pos
        return self._line_starts[line - 1] + col

    def tag_slice(self):
        start = self._at(self.getpos())
        end = self.source.index('>', start) + 1
        return start, end

    # ── structure ──
    def handle_starttag(self, tag, attrs):
        start, end = self.tag_slice()
        if self._opaque_depth == 0 and self._generated_depth == 0:
            self._attrs(tag, attrs, start, end)
        if tag in OPAQUE:
            self._opaque_depth += 1
        # The language switcher is written by the build, and the English pass
        # writes back over its own source. Extracting it would feed generated
        # markup into the catalogue as if a human had authored it, and every
        # rebuild would add more.
        if self._generated_depth or is_generated(attrs):
            self._generated_depth += 1
        if tag in VOID:
            self._mark_inline(tag)
            return
        node = _Node(tag, end)
        if self._open:
            self._open[-1].children.append(node)
        self._open.append(node)

    def handle_startendtag(self, tag, attrs):
        start, end = self.tag_slice()
        if self._opaque_depth == 0:
            self._attrs(tag, attrs, start, end)
        self._mark_inline(tag)

    def _mark_inline(self, tag):
        if self._open and tag not in INLINE:
            self._open[-1].has_block = True

    def handle_endtag(self, tag):
        if tag in OPAQUE and self._opaque_depth:
            self._opaque_depth -= 1
        if tag in VOID:
            return
        if self._generated_depth:
            depth_before = len(self._open)
            for i in range(depth_before - 1, -1, -1):
                if self._open[i].tag == tag:
                    self._generated_depth = max(0, self._generated_depth - 1)
                    break
        for i in range(len(self._open) - 1, -1, -1):
            if self._open[i].tag == tag:
                node = self._open[i]
                node.inner_end = self._at(self.getpos())
                del self._open[i:]
                if self._open:
                    parent = self._open[-1]
                    if tag not in INLINE:
                        parent.has_block = True
                    else:
                        parent.has_text |= node.has_text
                        parent.has_block |= node.has_block
                self.blocks.append(node)
                return

    def handle_data(self, data):
        if self._opaque_depth or self._generated_depth or not self._open:
            return
        if data.strip():
            self._open[-1].has_text = True

    # ── attributes ──
    def _attrs(self, tag, attrs, start, end):
        chunk = self.source[start:end]
        table = dict(attrs)

        wanted = set(TRANSLATABLE_ATTRS)
        if tag == 'meta':
            ident = table.get('name') or table.get('property') or ''
            if ident in META_KEYS:
                wanted.add('content')

        for name, value in attrs:
            if name not in wanted or not value or not is_translatable(value):
                continue
            m = re.search(r'%s\s*=\s*(["\'])(.*?)\1' % re.escape(name), chunk, re.S)
            if not m or normalise(m.group(2)) != normalise(value):
                continue
            self.spans.append((start + m.start(2), start + m.end(2), 'attr', m.group(2)))


def collect(source):
    c = Collector(source)
    c.feed(source)
    c.close()

    spans = list(c.spans)
    for node in c.blocks:
        if node.has_block or not node.has_text or node.inner_end is None:
            continue
        raw = source[node.inner_start:node.inner_end]
        if not is_translatable(re.sub(r'<[^>]+>', ' ', raw)):
            continue
        lead = len(raw) - len(raw.lstrip())
        trail = len(raw) - len(raw.rstrip())
        spans.append((node.inner_start + lead, node.inner_end - trail, 'block', raw.strip()))

    # Attributes sit inside a start tag and blocks start after it, so the two
    # kinds cannot overlap. Sorting and dropping overlaps is belt and braces.
    spans.sort()
    out, last = [], -1
    for span in spans:
        if span[0] >= last:
            out.append(span)
            last = span[1]
    return out


TAG_RE = re.compile(r'<\s*/?\s*([a-zA-Z][-a-zA-Z0-9]*)')


def tag_signature(markup):
    """Multiset of tag names, so a translation can be checked for lost markup."""
    from collections import Counter
    return Counter(m.group(1).lower() for m in TAG_RE.finditer(markup))


def apply_spans(source, spans, replace):
    """Rebuild the source with `replace(kind, text) -> str|None` applied."""
    parts, cursor = [], 0
    for start, end, kind, text in spans:
        new = replace(kind, text)
        if new is None:
            continue
        parts.append(source[cursor:start])
        parts.append(new)
        cursor = end
    parts.append(source[cursor:])
    return ''.join(parts)


def load(path, default=None):
    try:
        with open(path, encoding='utf-8') as fh:
            return json.load(fh)
    except FileNotFoundError:
        return default if default is not None else {}


def save(path, data):
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2, sort_keys=True)
        fh.write('\n')
