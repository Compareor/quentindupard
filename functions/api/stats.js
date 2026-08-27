/**
 * GET /api/stats — Cloudflare Pages Function
 *
 * Reads back the aggregates written by /api/track, for the public stats page.
 * Everything returned is an aggregate; there is nothing per-person to leak.
 *
 * Cost per request is SHARD_COUNT + 1 KV gets plus one list for the presence
 * count — a fixed five reads, not one per counter. The previous version listed
 * eight prefixes and issued a get per key, which measured 192 gets and 9 lists
 * on two days of data and grew with every new label.
 *
 * Binding: STATS (KV namespace).
 */

import {
  SHARD_KEYS, LEGACY_KEY, MIGRATED_FLAG,
  emptyDoc, merge, readDoc
} from './_aggregate.js';

export async function onRequestGet({ env }) {
  if (!env.STATS) {
    return json({ available: false, reason: 'No STATS KV namespace bound yet.' });
  }

  try {
    await migrateOnce(env.STATS);

    const docs = await Promise.all(
      [...SHARD_KEYS, LEGACY_KEY].map(key => readDoc(env.STATS, key))
    );

    const all = emptyDoc();
    docs.forEach(doc => { if (doc) merge(all, doc); });

    // `targets` is stored per event. The stats page wants it two ways: nested,
    // to build funnels and distributions, and flattened, for a click list.
    const clicks = {};
    Object.entries(all.targets).forEach(([event, labels]) => {
      if (!/^click_|^download$|^cart_|^mail_|^folder_/.test(event)) return;
      Object.entries(labels).forEach(([label, count]) => {
        clicks[label] = (clicks[label] || 0) + count;
      });
    });

    const days = Object.entries(all.days)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-14)
      .map(([date, metrics]) => [date, {
        views: metrics.views || 0,
        visitors: metrics.visitors || 0,
        events: metrics.events || 0
      }]);

    return json({
      available: true,
      totals: all.totals,
      events: sortDesc(all.events),
      sources: sortDesc(all.sources),
      files: sortDesc(all.files),
      sections: sortDesc(all.sections),
      campaigns: sortDesc(all.campaigns),
      clicks: sortDesc(clicks),
      byEvent: all.targets,
      liveNow: await countLive(env.STATS),
      days,
      generatedAt: new Date().toISOString()
    });
  } catch (_) {
    return json({ available: false, reason: 'Could not read stats.' }, 500);
  }
}

/**
 * Fold the old one-key-per-counter layout into a single frozen document.
 *
 * Runs at most once: the flag is set before the expensive part is retried, and
 * a failure here is swallowed so the endpoint still serves whatever the shards
 * hold. The old keys are left in place rather than deleted — deleting a few
 * hundred keys would burn the free tier's daily delete budget, and they cost
 * nothing sitting there.
 */
async function migrateOnce(kv) {
  try {
    if (await kv.get(MIGRATED_FLAG)) return;

    const legacy = emptyDoc();
    const groupFor = {
      'total:': null, 'event:': 'events', 'source:': 'sources',
      'file:': 'files', 'section:': 'sections', 'campaign:': 'campaigns'
    };

    for (const [prefix, group] of Object.entries(groupFor)) {
      const values = await readLegacyGroup(kv, prefix);
      const into = group ? legacy[group] : legacy.totals;
      Object.entries(values).forEach(([name, count]) => { into[name] = count; });
    }

    Object.entries(await readLegacyGroup(kv, 'target:')).forEach(([key, count]) => {
      const idx = key.indexOf(':');
      if (idx < 0) return;
      const event = key.slice(0, idx);
      const label = key.slice(idx + 1);
      (legacy.targets[event] = legacy.targets[event] || {})[label] = count;
    });

    Object.entries(await readLegacyGroup(kv, 'day:')).forEach(([key, count]) => {
      const [date, metric] = key.split(':');
      if (!date || !metric) return;
      (legacy.days[date] = legacy.days[date] || {})[metric] = count;
    });

    await kv.put(LEGACY_KEY, JSON.stringify(legacy));
    await kv.put(MIGRATED_FLAG, new Date().toISOString());
  } catch (_) {
    // Serve the shards rather than nothing. The next request tries again.
  }
}

async function readLegacyGroup(kv, prefix) {
  const out = {};
  let cursor;

  do {
    const page = await kv.list({ prefix, cursor, limit: 1000 });
    cursor = page.list_complete ? null : page.cursor;
    const entries = await Promise.all(
      page.keys.map(async k => [k.name.slice(prefix.length), parseInt((await kv.get(k.name)) || '0', 10)])
    );
    entries.forEach(([name, count]) => { if (name) out[name] = count; });
  } while (cursor);

  return out;
}

/* Sessions seen in the last few minutes. Keys expire on their own, so the
   count is just however many survive. The one list operation left in this
   endpoint. */
async function countLive(kv) {
  try {
    let cursor, total = 0;
    do {
      const page = await kv.list({ prefix: 'live:', cursor, limit: 1000 });
      total += page.keys.length;
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
    return total;
  } catch (_) {
    return 0;
  }
}

function sortDesc(obj) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]);
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=30',
      'access-control-allow-origin': '*'
    }
  });
}
