/**
 * Worker entry point.
 *
 * The site is static files plus a few API routes. This routes /api/* to the
 * same handlers Pages Functions would have used — one source of truth, so the
 * project deploys either way — and hands everything else to the assets binding.
 *
 * `_headers` and `_redirects` are Pages-only conventions, so the security
 * headers and the trailing-slash canonical are applied here instead.
 */

import { onRequestPost as askPost }     from '../functions/api/ask.js';
import { onRequestPost as contactPost } from '../functions/api/contact.js';
import { onRequestPost as trackPost }   from '../functions/api/track.js';
import { onRequestGet  as statsGet }    from '../functions/api/stats.js';
import { onRequestGet  as visitorGet }  from '../functions/api/visitor.js';
import { login, logout, read as adminRead, write as adminWrite, publicContent,
         questions as adminQuestions, deleteQuestion }
  from '../functions/api/admin.js';

const API = {
  '/api/ask':     { POST: askPost },
  '/api/contact': { POST: contactPost },
  '/api/track':   { POST: trackPost },
  '/api/stats':   { GET:  statsGet },
  '/api/visitor': { GET:  visitorGet },
  '/api/content': { GET:  publicContent },

  // Dashboard. Everything but the login is cookie-gated inside the handlers.
  '/api/admin/login':   { POST: login },
  '/api/admin/logout':  { POST: logout },
  '/api/admin/content': { GET:  adminRead, PUT: adminWrite },
  '/api/admin/questions': { GET: adminQuestions, POST: deleteQuestion }
};

// Superseded by the current positioning. 410 rather than 301 so search engines
// drop the URLs instead of forwarding them.
const GONE = {
  '/services': 'Current pricing and engagements: https://quentindupard.com/#pricing',
  '/contact':  'Write to me here: https://quentindupard.com/#inbox\nOr email: quentin.dupard@gmail.com'
};

// The first run of research pieces, withdrawn to be rewritten. 410 rather than
// a redirect to the hub: these URLs had distinct content and pointing them all
// at an index would be a soft 404 six times over, which search engines treat
// worse than an honest gone. Matched in every language.
const WITHDRAWN = /^(?:\/(?:fr|es))?\/research\/(pricing-metric|activation|positioning|expansion-revenue|rising-cac|what-to-kill)$/;


/* ── Language negotiation ─────────────────────────────────────
   A visitor whose browser asks for French gets French.

   Three constraints shape this more than the detection itself:

   1. Only the bare "/" negotiates. A deep link carries its own language, and
      redirecting one would fight the hreflang annotations that tell search
      engines these pages are the same page in three languages.
   2. Crawlers are never redirected. Googlebot crawls with an English
      Accept-Language from the US, so redirecting it is how a site ends up
      with only one of its three languages indexed.
   3. 302, never 301. A permanent redirect on a path whose correct
      destination depends on a request header is a cache poisoning bug
      waiting to happen — hence Vary as well.

   An explicit choice in the switcher writes qd_lang, and that always wins:
   someone who picked English on a French laptop meant it. */

const LOCALES = ['fr', 'es'];

const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|whatsapp|telegram|discord|lighthouse|headlesschrome|gptbot|claudebot|perplexity|oai-searchbot|chatgpt-user|applebot|duckduckbot|yandex|baidu/i;

function cookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return '';
}

/* Highest-q language the site actually speaks. Returns '' for English or for
   anything unrecognised, because English is the fallback either way. */
function preferredLocale(header) {
  if (!header) return '';
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params
        .map(p => p.trim())
        .filter(p => p.startsWith('q='))
        .map(p => parseFloat(p.slice(2)))[0];
      return { base: tag.trim().toLowerCase().split('-')[0], q: isNaN(q) ? 1 : q };
    })
    .filter(entry => entry.base && entry.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const entry of ranked) {
    if (entry.base === 'en') return '';          // English wins outright
    if (LOCALES.includes(entry.base)) return entry.base;
  }
  return '';
}

function negotiate(request, url) {
  if (url.pathname !== '/' || request.method !== 'GET') return null;
  if (url.searchParams.has('lang')) return null;   // explicit override in the URL
  if (BOT.test(request.headers.get('user-agent') || '')) return null;

  const chosen = cookie(request, 'qd_lang');
  const target = ['en', 'fr', 'es'].includes(chosen)
    ? chosen
    : preferredLocale(request.headers.get('accept-language'));

  if (!target || target === 'en') return null;

  return new Response(null, {
    status: 302,
    headers: {
      location: `/${target}/${url.search}`,
      'cache-control': 'no-store',
      vary: 'Accept-Language, Cookie'
    }
  });
}

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'geolocation=(), microphone=(), camera=(), payment=(), interest-cohort=()',
  'x-frame-options': 'SAMEORIGIN',
  'strict-transport-security': 'max-age=31536000; includeSubDomains'
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    // ── Language ──
    const redirect = negotiate(request, url);
    if (redirect) return redirect;

    // ── Permanently removed ──
    if (GONE[path]) {
      return withHeaders(new Response(`Gone. This page has been removed.\n\n${GONE[path]}\n`, {
        status: 410,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'public, max-age=86400',
          'x-robots-tag': 'noindex, nofollow'
        }
      }));
    }

    // ── Withdrawn research ──
    if (WITHDRAWN.test(path)) {
      return withHeaders(new Response(
        'Gone. This piece has been withdrawn and is being rewritten.\n\n' +
        'Whatever is published lives here: https://quentindupard.com/research/\n',
        {
          status: 410,
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': 'public, max-age=86400',
            'x-robots-tag': 'noindex, nofollow'
          }
        }));
    }

    // ── API ──
    const route = API[path];
    if (route) {
      const handler = route[request.method];
      if (!handler) {
        return withHeaders(new Response('Method not allowed', {
          status: 405,
          headers: { allow: Object.keys(route).join(', ') }
        }));
      }
      try {
        return withHeaders(await handler({ request, env, ctx }));
      } catch (err) {
        // A failing API route must never take the page down with it.
        return withHeaders(new Response('Upstream error.', {
          status: 502,
          headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
        }));
      }
    }

    // ── Canonical trailing slash for /research ──
    if (url.pathname === '/research') {
      return Response.redirect(new URL('/research/', url).toString(), 301);
    }

    // ── Static assets ──
    // Note that the assets layer answers most paths before this Worker runs
    // (see run_worker_first in wrangler.toml), so per-path response headers —
    // including the dashboard's noindex — belong in `_headers`, not here.
    const response = withHeaders(await env.ASSETS.fetch(request));
    if (url.pathname === '/') {
      // The root is the one URL whose content depends on request headers.
      response.headers.set('vary', 'Accept-Language, Cookie');
    }
    return response;
  }
};

/* Applied here because `_headers` is a Pages convention the Worker runtime
   does not read. Response headers are immutable, so this rebuilds. */
function withHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);

  const type = headers.get('content-type') || '';
  const url = headers.get('x-asset-path') || '';
  if (/^(image|font)\//.test(type) || /\.(css|js|svg|png|ico|woff2?)$/.test(url)) {
    if (!headers.has('cache-control')) {
      headers.set('cache-control', 'public, max-age=604800, must-revalidate');
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
