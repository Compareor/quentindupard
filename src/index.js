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

const API = {
  '/api/ask':     { POST: askPost },
  '/api/contact': { POST: contactPost },
  '/api/track':   { POST: trackPost },
  '/api/stats':   { GET:  statsGet },
  '/api/visitor': { GET:  visitorGet }
};

// Superseded by the current positioning. 410 rather than 301 so search engines
// drop the URLs instead of forwarding them.
const GONE = {
  '/services': 'Current pricing and engagements: https://quentindupard.com/#pricing',
  '/contact':  'Write to me here: https://quentindupard.com/#inbox\nOr email: quentin.dupard@gmail.com'
};

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
    return withHeaders(await env.ASSETS.fetch(request));
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
