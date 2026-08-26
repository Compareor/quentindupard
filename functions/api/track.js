/**
 * POST /api/track — Cloudflare Pages Function
 *
 * Takes a BATCH of events and folds it into counters.
 *
 * ── Why batched ──────────────────────────────────────────────
 * Workers KV allows 1,000 writes/day on the free plan. One visit
 * fires ~30 events, each touching 4-8 counters. Written one at a
 * time that is ~200 writes per visitor, and the daily quota is gone
 * after about five people.
 *
 * So the client buffers events and posts them together, and this
 * function merges the whole batch into a single delta per counter
 * before writing. A visit that cost ~200 writes now costs roughly
 * the number of DISTINCT counters it touched, about 20.
 *
 * ── Where the data lives ────────────────────────────────────
 *   Analytics Engine (optional binding: ANALYTICS)
 *       The full event stream, one row per event. No meaningful
 *       write ceiling, queried later with SQL. The right home for
 *       volume and for anything you want to slice after the fact.
 *   Workers KV (binding: STATS)
 *       Small pre-aggregated counters that /api/stats reads
 *       directly, plus 5-minute presence keys. Cheap to read and
 *       enough on its own to render the stats page.
 *
 * Counters only. No event log in KV, no IP, nothing that
 * reconstructs one person's path through the site.
 */

const NAME_PATTERN = /^[a-z][a-z0-9_]{1,38}$/;

const ALLOWED_EVENTS = new Set([
  // lifecycle
  'page_view', 'session_end', 'tab_hidden', 'tab_visible', 'js_error',
  // engagement
  'scroll_depth', 'dwell', 'section_view', 'copy_text', 'key_escape',
  'rage_click', 'click_dead',
  // clicks
  'click_link', 'click_button', 'click_anchor', 'click_outbound',
  'click_email', 'click_pdf', 'download',
  // forms
  'field_focus', 'form_submit',
  // features
  'ask_submit', 'chip_click', 'ask_close', 'symptom_pick',
  'compose_open', 'compose_send', 'compose_delivered', 'compose_failed',
  'mail_open', 'mail_folder', 'attachment_download',
  'folder_open', 'note_open', 'window_close',
  'desktop_download', 'desktop_link', 'desktop_page',
  // commercial intent
  'cart_add', 'cart_remove', 'cart_buy', 'mode_change', 'dodge',
  // preferences
  'glass_level', 'theme_switch', 'faq_open',
  'newsletter_yes', 'newsletter_no', 'newsletter_declined', 'newsletter_subscribed',
  'newsletter_failed', 'handoff_book', 'handoff_write', 'paywall_shown', 'paywall_subscribe', 'paywall_talk', 'carousel_prev', 'carousel_next',
  'toast_shown', 'toast_dismissed', 'toast_cta'
]);

// Cap distinct label keys so nobody can fill the namespace by posting
// arbitrary strings. Past the cap, new labels roll into `other`.
const MAX_LABEL_KEYS = 400;
const MAX_BATCH = 60;

export async function onRequestPost({ request, env }) {
  if (!env.STATS) return new Response(null, { status: 204 });

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return new Response(null, { status: 204 });
  }

  const events = Array.isArray(body.events) ? body.events.slice(0, MAX_BATCH) : [];
  if (!events.length) return new Response(null, { status: 204 });

  const day = new Date().toISOString().slice(0, 10);
  const utm = body.utm || {};
  const source = clean(utm.utm_source) || 'direct';
  const campaign = clean(utm.utm_campaign);
  const medium = clean(utm.utm_medium);
  const visitor = clean(body.visitor);
  const session = clean(body.session);

  // Fold the batch into key -> delta. This is the whole point: one write per
  // distinct counter, however many events contributed to it.
  const deltas = new Map();
  const add = (key, n) => deltas.set(key, (deltas.get(key) || 0) + (n || 1));

  const labelled = [];
  let sawPageView = false;

  for (const raw of events) {
    const event = String((raw && raw.event) || '');
    if (!NAME_PATTERN.test(event) || !ALLOWED_EVENTS.has(event)) continue;

    const props = raw.props || {};
    const target = clean(props.target);
    const section = clean(props.section);

    add('total:events');
    add(`event:${event}`);
    add(`day:${day}:events`);
    add(`source:${source}`);
    if (campaign) add(`campaign:${campaign}`);
    if (medium) add(`medium:${medium}`);
    if (section) add(`section:${section}`);
    if (target) labelled.push([event, target]);
    if (event === 'page_view') sawPageView = true;

    writeStream(env, { event, target, section, source, campaign, medium });
  }

  // Label keys are budgeted, so resolve them after the main fold.
  for (const [event, target] of labelled) {
    const key = `target:${event}:${target}`;
    const allowed = await withinLabelBudget(env.STATS, key);
    add(allowed ? key : `target:${event}:other`);
    if (/download/.test(event)) add(`file:${target}`);
  }

  if (sawPageView) {
    add('total:views');
    add(`day:${day}:views`);

    // Unique-ish visitors: a first-seen marker with a 90-day TTL. Enough for a
    // headline number, not enough to be a profile.
    if (visitor) {
      const seenKey = `seen:${visitor}`;
      try {
        if (!(await env.STATS.get(seenKey))) {
          await env.STATS.put(seenKey, '1', { expirationTtl: 60 * 60 * 24 * 90 });
          add('total:visitors');
          add(`day:${day}:visitors`);
        }
      } catch (_) { /* ignore */ }
    }
  }

  // Presence for "reading now". Self-expiring, so there is no cleanup job.
  if (session) {
    try { await env.STATS.put(`live:${session}`, '1', { expirationTtl: 300 }); }
    catch (_) { /* ignore */ }
  }

  await Promise.all(Array.from(deltas, ([key, n]) => bump(env.STATS, key, n)));

  return new Response(null, { status: 204 });
}

/* Full-fidelity event stream. Analytics Engine has no meaningful write
   ceiling, so every event goes here even though only aggregates reach KV.
   A missing binding is skipped silently; the KV counters still work. */
function writeStream(env, row) {
  if (!env.ANALYTICS) return;
  try {
    env.ANALYTICS.writeDataPoint({
      blobs: [row.event, row.target || '', row.section || '',
              row.source || '', row.campaign || '', row.medium || ''],
      doubles: [1],
      indexes: [row.event]
    });
  } catch (_) { /* never let analytics break a request */ }
}

async function withinLabelBudget(kv, key) {
  try {
    if (await kv.get(key)) return true;             // already counted
    const used = parseInt((await kv.get('meta:labelCount')) || '0', 10);
    if (used >= MAX_LABEL_KEYS) return false;
    await kv.put('meta:labelCount', String(used + 1));
    return true;
  } catch (_) {
    return false;
  }
}

/* KV has no atomic increment, so this is read-modify-write. Two batches
   landing on the same counter in the same instant can lose a tick. At this
   site's volume that changes no decision these numbers inform, and if it ever
   does, the Analytics Engine stream above is the exact record. */
async function bump(kv, key, n) {
  try {
    const current = parseInt((await kv.get(key)) || '0', 10);
    await kv.put(key, String(current + n));
  } catch (_) { /* ignore */ }
}

function clean(value) {
  if (!value && value !== 0) return '';
  return String(value).toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 48);
}
