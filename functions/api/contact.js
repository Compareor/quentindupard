/**
 * POST /api/contact — Cloudflare Pages Function
 *
 * The mailbox compose form. This genuinely delivers: it is a contact form
 * wearing a mail client costume, so it is treated with the seriousness of a
 * contact form — validation, spam traps, rate limiting, and a KV fallback so
 * a mail-provider outage never silently swallows a lead.
 *
 * Bindings:
 *   RESEND_API_KEY  (secret)   — required to actually send
 *   RESEND_FROM     (var)      — optional, defaults to Resend's sandbox sender
 *   CONTACT_TO      (var)      — optional, defaults to Quentin's address
 *   STATS           (KV)       — optional, used for rate limiting + fallback store
 */

const MAX_SUBJECT = 160;
const MAX_BODY = 4000;
const MAX_EMAIL = 160;

const WINDOW_SECONDS = 3600;
const MAX_PER_WINDOW = 5;

// A form filled faster than this was filled by a script, not a person.
const MIN_FILL_MS = 2500;

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch (_) {
    return json({ ok: false, error: 'Malformed request.' }, 400);
  }

  // Honeypot: a real person never sees this field, so anything in it is a bot.
  // Answer 200 so the bot believes it succeeded and doesn't retry.
  if (payload.company) return json({ ok: true, delivered: true });

  if (typeof payload.elapsed === 'number' && payload.elapsed < MIN_FILL_MS) {
    return json({ ok: true, delivered: true });
  }

  const from = String(payload.from || '').trim().slice(0, MAX_EMAIL);
  const subject = String(payload.subject || '').trim().slice(0, MAX_SUBJECT);
  const body = String(payload.body || '').trim().slice(0, MAX_BODY);

  if (!isEmail(from)) return json({ ok: false, error: 'That email address does not look right.' }, 400);
  if (!subject) return json({ ok: false, error: 'A subject helps.' }, 400);
  if (body.length < 10) return json({ ok: false, error: 'Tell me a little more than that.' }, 400);

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!(await underRateLimit(env, ip))) {
    return json({ ok: false, error: 'That is a lot of messages. Try again in a bit, or email me directly.' }, 429);
  }

  const cf = request.cf || {};
  const context = [
    `From:     ${from}`,
    `Subject:  ${subject}`,
    `Location: ${[cf.city, cf.country].filter(Boolean).join(', ') || 'unknown'}`,
    `Network:  ${cf.asOrganization || 'unknown'}`,
    `Sent:     ${new Date().toISOString()}`
  ].join('\n');

  const text = `${context}\n\n${'-'.repeat(48)}\n\n${body}\n`;

  // Always keep a copy first. If the mail provider is down, the message is
  // still recoverable rather than lost.
  await stash(env, { from, subject, body, at: Date.now() });

  if (!env.RESEND_API_KEY) {
    return json({
      ok: true,
      delivered: false,
      note: 'Saved, but email delivery is not configured on this deployment yet.'
    });
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        from: env.RESEND_FROM || 'quentindupard.com <onboarding@resend.dev>',
        to: [env.CONTACT_TO || 'quentin.dupard@gmail.com'],
        // The whole point: hitting reply goes straight back to the sender.
        reply_to: from,
        subject: `[quentindupard.com] ${subject}`,
        text
      })
    });

    if (!res.ok) {
      return json({ ok: true, delivered: false, note: 'Saved, but the mail provider rejected it.' });
    }
    return json({ ok: true, delivered: true });
  } catch (_) {
    return json({ ok: true, delivered: false, note: 'Saved, but the mail provider could not be reached.' });
  }
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= MAX_EMAIL;
}

async function stash(env, message) {
  if (!env.STATS) return;
  try {
    await env.STATS.put(
      `msg:${message.at}:${Math.random().toString(36).slice(2, 8)}`,
      JSON.stringify(message),
      { expirationTtl: 60 * 60 * 24 * 60 }   // 60 days is plenty to notice a failure
    );
  } catch (_) { /* never block a send on the backup */ }
}

async function underRateLimit(env, ip) {
  if (!env.STATS) return true;
  try {
    const key = 'contact:' + (await sha256(ip));
    const used = parseInt((await env.STATS.get(key)) || '0', 10);
    if (used >= MAX_PER_WINDOW) return false;
    await env.STATS.put(key, String(used + 1), { expirationTtl: WINDOW_SECONDS });
    return true;
  } catch (_) {
    return true;
  }
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}
