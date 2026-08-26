/**
 * GET /api/stats — Cloudflare Pages Function
 *
 * Reads back the counters written by /api/track, for the public stats page.
 * Everything returned is an aggregate; there is nothing per-person to leak.
 *
 * Binding: STATS (KV namespace).
 */

export async function onRequestGet({ env }) {
  if (!env.STATS) {
    return json({ available: false, reason: 'No STATS KV namespace bound yet.' });
  }

  try {
    const [totals, events, sources, files, days, sections, campaigns, targets] = await Promise.all([
      readGroup(env.STATS, 'total:'),
      readGroup(env.STATS, 'event:'),
      readGroup(env.STATS, 'source:'),
      readGroup(env.STATS, 'file:'),
      readGroup(env.STATS, 'day:'),
      readGroup(env.STATS, 'section:'),
      readGroup(env.STATS, 'campaign:'),
      readGroup(env.STATS, 'target:')
    ]);

    // target keys are `target:<event>:<label>`. Split into a per-event map so
    // the client can build funnels and distributions, and a flat click list.
    const byEvent = {};
    const clicks = {};
    Object.entries(targets).forEach(([key, count]) => {
      const idx = key.indexOf(':');
      if (idx < 0) return;
      const event = key.slice(0, idx);
      const label = key.slice(idx + 1);
      (byEvent[event] = byEvent[event] || {})[label] = count;
      if (/^click_|^download$|^cart_|^mail_|^folder_/.test(event)) {
        clicks[label] = (clicks[label] || 0) + count;
      }
    });

    const liveNow = await countLive(env.STATS);

    // day: keys look like `day:2026-08-25:views` — fold them into one row/day.
    const byDay = {};
    Object.entries(days).forEach(([key, count]) => {
      const [date, metric] = key.split(':');
      if (!date || !metric) return;
      byDay[date] = byDay[date] || { views: 0, visitors: 0, events: 0 };
      byDay[date][metric] = count;
    });

    return json({
      available: true,
      totals,
      events: sortDesc(events),
      sources: sortDesc(sources),
      files: sortDesc(files),
      sections: sortDesc(sections),
      campaigns: sortDesc(campaigns),
      clicks: sortDesc(clicks),
      byEvent,
      liveNow,
      days: Object.entries(byDay).sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-14),
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    return json({ available: false, reason: 'Could not read stats.' }, 500);
  }
}

/* Sessions seen in the last few minutes. Keys expire on their own, so the
   count is just however many survive. */
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

async function readGroup(kv, prefix) {
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
