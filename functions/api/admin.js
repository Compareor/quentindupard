/**
 * Admin session + content store.
 *
 * One secret, `ADMIN_PASSWORD`, set with:
 *   npx wrangler secret put ADMIN_PASSWORD
 *
 * There is no user table and no password reset, because there is exactly one
 * user. A correct password mints a short-lived signed cookie; the signature key
 * is derived from the password itself, so rotating the secret invalidates every
 * outstanding session for free.
 *
 * The edited content lives in one KV value. The site keeps its baked-in
 * defaults in assets/content.js and only overlays this when it exists, so an
 * empty store, a KV outage, or a bad deploy all degrade to the shipped content
 * rather than to an empty fort.
 */

const COOKIE     = 'qd_admin';
const SESSION_S  = 12 * 60 * 60;   // 12 hours
const STORE_KEY  = 'content:v1';
const MAX_BYTES  = 256 * 1024;
const MAX_TRIES  = 8;              // login attempts per IP per hour

const KINDS = new Set(['page', 'pdf', 'note', 'link']);

/*
 * What "Clear stats" removes. An allowlist, not an exclusion rule: getting this
 * wrong the other way would delete the content store or the question log.
 *
 * The first entry is the current aggregate documents. The rest are the flat
 * per-counter keys from the layout that predated them — they are what the
 * one-time import reads, so leaving them behind means the numbers come back.
 *
 * Deliberately NOT here: seen: (tells a returning visitor from a new one),
 * live: and visit: (self-expiring), qlog: (the questions), content: (the
 * fort and mailbox edited in this dashboard).
 */
const RESETTABLE = [
  'agg:v1:',
  'total:', 'event:', 'source:', 'medium:', 'campaign:',
  'section:', 'file:', 'target:', 'day:', 'meta:'
];

const MIGRATED_FLAG = 'agg:v1:migrated';

const json = (body, status, extra) => new Response(JSON.stringify(body), {
  status: status || 200,
  headers: Object.assign({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  }, extra || {})
});

/* ── Signing ───────────────────────────────────────────────── */

async function key(secret) {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
}

function b64url(bytes) {
  let s = '';
  new Uint8Array(bytes).forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(secret, payload) {
  const mac = await crypto.subtle.sign('HMAC', await key(secret), new TextEncoder().encode(payload));
  return b64url(mac);
}

/* Compare by hashing both sides first. Comparing the raw strings leaks length
   and position of the first mismatch through timing; comparing fixed-length
   digests does not. */
async function equals(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b))
  ]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return '';
}

async function authed(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const token = readCookie(request, COOKIE);
  if (!token) return false;
  const [exp, mac] = token.split('.');
  if (!exp || !mac) return false;
  if (!/^\d+$/.test(exp) || Number(exp) * 1000 < Date.now()) return false;
  return equals(mac, await sign(env.ADMIN_PASSWORD, 'admin:' + exp));
}

function setCookie(value, maxAge) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

/* ── Validation ────────────────────────────────────────────── */

const text = (v, max) => (typeof v === 'string' ? v : '').slice(0, max).trim();

/* Only same-site paths and http(s). Blocks javascript: and data:, which would
   otherwise be a stored-XSS hole reachable from the one place that writes here. */
function href(v) {
  const s = text(v, 500);
  if (!s) return '';
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return '';
}

function cleanItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = KINDS.has(raw.kind) ? raw.kind : 'link';
  const item = {
    name: text(raw.name, 160),
    kind,
    meta: text(raw.meta, 60)
  };
  if (!item.name) return null;

  if (kind === 'note') {
    const body = Array.isArray(raw.body) ? raw.body : String(raw.body || '').split('\n');
    item.body = body.map(p => text(p, 1200)).filter(Boolean).slice(0, 40);
    if (!item.body.length) return null;
  } else {
    item.href = href(raw.href);
    if (!item.href) return null;
  }
  return item;
}

function cleanFolder(raw, i) {
  if (!raw || typeof raw !== 'object') return null;
  const name = text(raw.name, 60);
  if (!name) return null;
  return {
    id: text(raw.id, 40).replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'folder-' + i,
    name,
    kind: 'folder',
    items: (Array.isArray(raw.items) ? raw.items : []).map(cleanItem).filter(Boolean).slice(0, 40)
  };
}

function cleanMail(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const subject = text(raw.subject, 160);
  if (!subject) return null;
  const body = Array.isArray(raw.body) ? raw.body : String(raw.body || '').split('\n');
  const mail = {
    from:    text(raw.from, 80),
    email:   text(raw.email, 120),
    role:    text(raw.role, 120),
    subject,
    time:    text(raw.time, 40),
    body:    body.map(p => text(p, 2000)).filter(Boolean).slice(0, 40),
    attach: (Array.isArray(raw.attach) ? raw.attach : []).map((a) => {
      const name = text(a && a.name, 120);
      const url  = href(a && a.href);
      return name && url ? { name, href: url, size: text(a && a.size, 40) } : null;
    }).filter(Boolean).slice(0, 6)
  };
  const id = text(raw.id, 40).replace(/[^a-z0-9-]/gi, '').toLowerCase();
  if (id) mail.id = id;
  return mail;
}

function cleanStore(raw) {
  return {
    version: 1,
    updated: new Date().toISOString(),
    desktop: (Array.isArray(raw && raw.desktop) ? raw.desktop : [])
      .map(cleanFolder).filter(Boolean).slice(0, 12),
    mailbox: (Array.isArray(raw && raw.mailbox) ? raw.mailbox : [])
      .map(cleanMail).filter(Boolean).slice(0, 30)
  };
}

/* ── Routes ────────────────────────────────────────────────── */

export async function login({ request, env }) {
  if (!env.ADMIN_PASSWORD) {
    return json({ error: 'Admin password is not configured on this deployment.' }, 503);
  }

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const bucket = 'admin:' + ip;
  let tries = 0;
  if (env.RATE_LIMIT) {
    tries = Number(await env.RATE_LIMIT.get(bucket)) || 0;
    if (tries >= MAX_TRIES) {
      return json({ error: 'Too many attempts. Try again in an hour.' }, 429);
    }
  }

  let password = '';
  try { password = String((await request.json()).password || ''); } catch (_) { /* empty */ }

  if (!(await equals(password, env.ADMIN_PASSWORD))) {
    // Only failures are counted, so normal use never burns through the budget.
    if (env.RATE_LIMIT) {
      await env.RATE_LIMIT.put(bucket, String(tries + 1), { expirationTtl: 3600 });
    }
    return json({ error: 'Wrong password.' }, 401);
  }

  const exp = Math.floor(Date.now() / 1000) + SESSION_S;
  const token = exp + '.' + await sign(env.ADMIN_PASSWORD, 'admin:' + exp);
  return json({ ok: true, expires: exp }, 200, { 'set-cookie': setCookie(token, SESSION_S) });
}

export async function logout() {
  return json({ ok: true }, 200, { 'set-cookie': setCookie('', 0) });
}

export async function read({ request, env }) {
  if (!(await authed(request, env))) return json({ error: 'Not signed in.' }, 401);
  if (!env.STATS) return json({ error: 'Content storage is not bound.' }, 503);

  const raw = await env.STATS.get(STORE_KEY);
  return json({ ok: true, store: raw ? JSON.parse(raw) : null });
}

export async function write({ request, env }) {
  if (!(await authed(request, env))) return json({ error: 'Not signed in.' }, 401);
  if (!env.STATS) return json({ error: 'Content storage is not bound.' }, 503);

  let incoming;
  try { incoming = await request.json(); } catch (_) {
    return json({ error: 'Malformed body.' }, 400);
  }

  const store = cleanStore(incoming);
  const body = JSON.stringify(store);
  if (body.length > MAX_BYTES) {
    return json({ error: 'Too large. Trim some entries and save again.' }, 413);
  }

  await env.STATS.put(STORE_KEY, body);
  return json({ ok: true, store });
}

/**
 * GET /api/admin/questions — everything asked of AI-me, newest first.
 *
 * The text is in each key's metadata, so this is one list() and no per-key
 * reads however many questions there are. Keys expire after 90 days on their
 * own; there is no cleanup job and no way for this to grow without bound.
 */
export async function questions({ request, env }) {
  if (!(await authed(request, env))) return json({ error: 'Not signed in.' }, 401);
  if (!env.STATS) return json({ error: 'Storage is not bound.' }, 503);

  const rows = [];
  let cursor;
  do {
    const page = await env.STATS.list({ prefix: 'qlog:', cursor, limit: 1000 });
    cursor = page.list_complete ? null : page.cursor;
    for (const k of page.keys) {
      const m = k.metadata || {};
      if (m.q) rows.push({ key: k.name, q: m.q, at: m.at || 0, lang: m.lang || 'en', thread: m.thread || '' });
    }
  } while (cursor && rows.length < 2000);

  rows.sort((a, b) => b.at - a.at);
  return json({ ok: true, questions: rows });
}

/** DELETE one logged question. */
export async function deleteQuestion({ request, env }) {
  if (!(await authed(request, env))) return json({ error: 'Not signed in.' }, 401);
  if (!env.STATS) return json({ error: 'Storage is not bound.' }, 503);

  let key = '';
  try { key = String((await request.json()).key || ''); } catch (_) { /* empty */ }
  if (!key.startsWith('qlog:')) return json({ error: 'Not a question key.' }, 400);

  await env.STATS.delete(key);
  return json({ ok: true });
}

/**
 * POST /api/admin/reset-stats — clear the aggregate counters.
 *
 * Needed once, because attribution used to be counted per event rather than
 * per visit: "direct" read 1,704 from about ten visits. Old and new numbers
 * cannot be added together meaningfully, so the old ones have to go.
 *
 * Only the aggregate documents are deleted. The `seen:` markers survive on
 * purpose — they are what tells a returning visitor from a new one, and
 * clearing them would make every existing reader look new for 90 days.
 * Logged questions are untouched.
 */
export async function resetStats({ request, env }) {
  if (!(await authed(request, env))) return json({ error: 'Not signed in.' }, 401);
  if (!env.STATS) return json({ error: 'Storage is not bound.' }, 503);

  let removed = 0;
  for (const prefix of RESETTABLE) {
    let cursor;
    do {
      const page = await env.STATS.list({ prefix, cursor, limit: 1000 });
      cursor = page.list_complete ? null : page.cursor;
      for (const k of page.keys) {
        await env.STATS.delete(k.name);
        removed++;
      }
    } while (cursor);
  }

  /*
   * Re-arm the migration flag straight away.
   *
   * It lives under agg:v1: and so was deleted with everything else, which made
   * the reset undo itself: /api/stats saw no flag, re-ran the one-time import
   * of the old per-key counters, and rebuilt the very numbers that had just
   * been cleared. Those keys are now deleted above as well, but the flag still
   * has to be set or the import would run again over an empty set and waste a
   * list on every request.
   */
  await env.STATS.put(MIGRATED_FLAG, new Date().toISOString());

  return json({ ok: true, removed });
}

/* Public. Returns 204 when nothing has been edited, which is the signal for
   the page to keep the defaults it already shipped with. */
export async function publicContent({ env }) {
  if (!env.STATS) return new Response(null, { status: 204 });
  const raw = await env.STATS.get(STORE_KEY);
  if (!raw) return new Response(null, { status: 204 });
  return new Response(raw, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Short, so an edit shows up quickly without hammering KV reads.
      'cache-control': 'public, max-age=60'
    }
  });
}

export { authed };
