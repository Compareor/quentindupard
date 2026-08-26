/**
 * /contact — permanently removed. See functions/services/index.js for why 410
 * rather than 301. Contact now lives in the mailbox on the homepage.
 */
export const onRequest = () =>
  new Response(
    'Gone. This page has been removed.\n\n' +
    'Write to me here: https://quentindupard.com/#inbox\n' +
    'Or email: quentin.dupard@gmail.com\n',
    {
      status: 410,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=86400',
        'x-robots-tag': 'noindex, nofollow'
      }
    }
  );
