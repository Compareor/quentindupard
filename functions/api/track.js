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
 *       A few sharded JSON documents holding the aggregates that
 *       /api/stats renders, plus 5-minute presence keys. See
 *       _aggregate.js for why documents rather than one key per
 *       counter: a batch is now one read and one write, not one
 *       write per counter it touched.
 *
 * Counters only. No event log in KV, no IP, nothing that
 * reconstructs one person's path through the site.
 */

import {
  SHARD_KEYS, emptyDoc, merge, readDoc, shardFor
} from './_aggregate.js';

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
  'folder_open', 'note_open', 'window_close', 'video_play',
  'desktop_download', 'desktop_link', 'desktop_page',
  // commercial intent
  'cart_add', 'cart_remove', 'cart_buy', 'mode_change', 'dodge',
  // preferences
  'glass_level', 'theme_switch', 'faq_open',
  'newsletter_yes', 'newsletter_no', 'newsletter_declined', 'newsletter_subscribed',
  'newsletter_failed', 'handoff_book', 'handoff_write', 'paywall_shown', 'paywall_subscribe', 'paywall_talk',
  'discount_open', 'discount_won', 'discount_checkout', 'carousel_prev', 'carousel_next',
  'toast_shown', 'toast_dismissed', 'toast_cta'
]);

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

  // Accumulate the whole batch in memory first. Nothing touches KV until the
  // shape is final, so the read-modify-write window stays as short as possible.
  const delta = emptyDoc();
  const bump = (into, key, n) => { if (key) into[key] = (into[key] || 0) + (n || 1); };
  const forDay = (metric) => {
    const d = delta.days[day] = delta.days[day] || {};
    d[metric] = (d[metric] || 0) + 1;
  };

  let sawPageView = false;

  for (const raw of events) {
    const event = String((raw && raw.event) || '');
    if (!NAME_PATTERN.test(event) || !ALLOWED_EVENTS.has(event)) continue;

    const props = raw.props || {};
    const target = clean(props.target);
    const section = clean(props.section);

    bump(delta.totals, 'events');
    bump(delta.events, event);
    if (section) bump(delta.sections, section);
    forDay('events');

    if (target) {
      const into = delta.targets[event] = delta.targets[event] || {};
      into[target] = (into[target] || 0) + 1;
      if (/download/.test(event)) bump(delta.files, target);
    }

    if (event === 'page_view') sawPageView = true;

    writeStream(env, { event, target, section, source, campaign, medium });
  }

  if (sawPageView) {
    bump(delta.totals, 'views');
    forDay('views');
  }

  /*
   * Attribution and the visitor split are decided ONCE PER VISIT.
   *
   * They used to be counted inside the event loop, which made "where people
   * come from" a count of scroll ticks rather than of people: roughly 170 per
   * visit, so ten visits read as 1,704 from "direct".
   *
   * A visit is a session, which is a browser tab. The marker expires after
   * twelve hours so a tab left open overnight starts a new visit rather than
   * counting forever, and every batch after the first in the same session
   * finds the marker and adds nothing.
   */
  if (session) {
    try {
      const visitKey = `visit:${session}`;
      if (!(await env.STATS.get(visitKey))) {
        await env.STATS.put(visitKey, '1', { expirationTtl: 60 * 60 * 12 });

        bump(delta.totals, 'visits');
        forDay('visits');
        bump(delta.sources, source);
        if (campaign) bump(delta.campaigns, campaign);
        if (medium) bump(delta.mediums, medium);

        // First time ever, or back again? The seen marker is the only thing
        // that distinguishes them, and it holds a random id for 90 days —
        // enough to tell new from returning, not enough to be a profile.
        if (visitor) {
          const seenKey = `seen:${visitor}`;
          if (await env.STATS.get(seenKey)) {
            bump(delta.totals, 'returning');
            forDay('returning');
          } else {
            await env.STATS.put(seenKey, '1', { expirationTtl: 60 * 60 * 24 * 90 });
            bump(delta.totals, 'visitors');
            forDay('visitors');
          }
        }
      }
    } catch (_) { /* a counting hiccup must not break the request */ }
  }

  // Presence for "reading now". Self-expiring, so there is no cleanup job.
  if (session) {
    try { await env.STATS.put(`live:${session}`, '1', { expirationTtl: 300 }); }
    catch (_) { /* ignore */ }
  }

  await commit(env.STATS, session || visitor || 'anon', delta);

  return new Response(null, { status: 204 });
}

/* One read, one write, whatever the batch contained.
   KV has no compare-and-swap, so two batches landing on the same shard in the
   same instant can lose one of them. Sharding by session makes that rare; the
   Analytics Engine stream above is the exact record if it ever matters. */
async function commit(kv, seed, delta) {
  const key = SHARD_KEYS[shardFor(seed)];
  try {
    const doc = (await readDoc(kv, key)) || emptyDoc();
    await kv.put(key, JSON.stringify(merge(doc, delta)));
  } catch (_) { /* analytics must never break a request */ }
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

function clean(value) {
  if (!value && value !== 0) return '';
  return String(value).toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 48);
}
