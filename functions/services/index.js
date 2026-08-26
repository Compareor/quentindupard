/**
 * /services — permanently removed.
 *
 * 410 Gone rather than 301: these pages described the previous positioning
 * (GTM strategy / global hiring), and the goal is for search engines and AI
 * crawlers to DROP the URL entirely, not to forward it. A 301 keeps the URL
 * resolving and transfers signals; 410 says "this is deleted, stop asking".
 *
 * The trade is that any ranking these URLs had is discarded. That is the
 * intended outcome here — a contradictory second identity was costing more
 * than the URLs were worth.
 */
export const onRequest = () => gone();

export function gone() {
  return new Response(
    'Gone. This page has been removed.\n\n' +
    'Current pricing and engagements: https://quentindupard.com/#pricing\n',
    {
      status: 410,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=86400',
        'x-robots-tag': 'noindex, nofollow'
      }
    }
  );
}
