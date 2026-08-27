/**
 * The shape of the stats aggregate, shared by /api/track (writer) and
 * /api/stats (reader).
 *
 * ── Why documents instead of one key per counter ─────────────
 * The original design gave every counter its own KV key. Reading the stats
 * page then meant listing eight prefixes and issuing a `get` per key — 192
 * gets and 9 lists per request on two days of data, growing with every new
 * label. Cloudflare's free tier allows 1,000 list operations a day, so about
 * 110 views of a page linked from every footer exhausted it.
 *
 * Counters now live in a handful of JSON documents. Reading the whole stats
 * page is SHARD_COUNT + 1 gets. Writing a batch is one get and one put,
 * instead of one put per distinct counter, which also takes a visit from
 * ~40 KV writes down to ~3.
 *
 * ── Why sharded ─────────────────────────────────────────────
 * One document would mean every concurrent visitor doing read-modify-write on
 * the same key, and KV has no compare-and-swap: a lost race would drop a whole
 * batch rather than a single tick. Sessions are spread across a few shards so
 * concurrent writers usually touch different documents. This narrows the race,
 * it does not close it. Analytics Engine holds the exact per-event record if a
 * number ever has to be defended.
 */

export const SHARD_COUNT = 4;
export const SHARD_KEYS = Array.from({ length: SHARD_COUNT }, (_, i) => `agg:v1:${i}`);

/* Written once by the migration in /api/stats, then read like any other
   document. Keeps the numbers from before this change. */
export const LEGACY_KEY = 'agg:v1:legacy';
export const MIGRATED_FLAG = 'agg:v1:migrated';

/* Per-shard ceiling on distinct label keys, so nobody can inflate a document
   by posting arbitrary strings. Past the cap, new labels roll into `other`. */
export const MAX_LABELS_PER_EVENT = 60;
export const MAX_KEYS_PER_GROUP = 200;
export const MAX_DAYS = 60;

export const GROUPS = ['events', 'sources', 'campaigns', 'mediums', 'sections', 'files'];

export function emptyDoc() {
  const doc = { totals: {}, targets: {}, days: {} };
  GROUPS.forEach(g => { doc[g] = {}; });
  return doc;
}

/* Stable, synchronous, and only used to spread writers across shards — the
   distribution matters, the algorithm does not. */
export function shardFor(seed) {
  let h = 5381;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h) % SHARD_COUNT;
}

function addInto(target, key, n, cap) {
  if (!key) return;
  if (!(key in target) && cap && Object.keys(target).length >= cap) {
    target.other = (target.other || 0) + n;
    return;
  }
  target[key] = (target[key] || 0) + n;
}

/**
 * Fold `delta` into `doc` in place. Both use the same shape, which is what
 * lets the writer accumulate a batch and the reader merge shards with one
 * function instead of two that can drift apart.
 */
export function merge(doc, delta) {
  Object.entries(delta.totals || {}).forEach(([k, n]) => addInto(doc.totals, k, n));

  GROUPS.forEach((group) => {
    Object.entries(delta[group] || {}).forEach(([k, n]) => {
      addInto(doc[group], k, n, MAX_KEYS_PER_GROUP);
    });
  });

  Object.entries(delta.targets || {}).forEach(([event, labels]) => {
    const into = doc.targets[event] = doc.targets[event] || {};
    Object.entries(labels).forEach(([label, n]) => addInto(into, label, n, MAX_LABELS_PER_EVENT));
  });

  Object.entries(delta.days || {}).forEach(([day, metrics]) => {
    const into = doc.days[day] = doc.days[day] || {};
    Object.entries(metrics).forEach(([metric, n]) => addInto(into, metric, n));
  });

  // Unbounded day growth is the one leak a per-key cap does not cover.
  const days = Object.keys(doc.days).sort();
  if (days.length > MAX_DAYS) {
    days.slice(0, days.length - MAX_DAYS).forEach(d => { delete doc.days[d]; });
  }

  return doc;
}

export async function readDoc(kv, key) {
  try {
    const raw = await kv.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;   // unreadable or malformed — treated as absent
  }
}
