/**
 * GET /api/visitor — Cloudflare Pages Function
 *
 * Resolves the visitor's connection into a city / country / organisation using
 * the `cf` object Cloudflare attaches to every request. No lookup service, no
 * third-party script, no cookie.
 *
 * Deliberately does NOT log or persist the IP. The whole point of the demo on
 * the homepage is that this can be done without building a profile, so the
 * implementation has to actually hold that line.
 */

export async function onRequestGet({ request }) {
  const cf = request.cf || {};

  const body = {
    city:     cf.city              || '',
    region:   cf.region            || '',
    country:  countryName(cf.country) || '',
    timezone: cf.timezone          || '',
    // asOrganization is the network operator — a company name on a corporate
    // network, an ISP on home broadband. The client decides which is worth
    // showing; sending it raw keeps that judgement in one place.
    org:      cf.asOrganization    || '',
    colo:     cf.colo              || ''
  };

  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Per-visitor response — must never be shared by a cache.
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex'
    }
  });
}

/* Cloudflare gives a two-letter code; a name reads better in the UI.
   Only the markets that actually show up in this site's traffic are mapped —
   anything else falls through to the code, which is still meaningful. */
const COUNTRIES = {
  US: 'United States',  GB: 'United Kingdom', FR: 'France',      DE: 'Germany',
  ES: 'Spain',          IT: 'Italy',          NL: 'Netherlands', BE: 'Belgium',
  CH: 'Switzerland',    AT: 'Austria',        SE: 'Sweden',      NO: 'Norway',
  DK: 'Denmark',        FI: 'Finland',        IE: 'Ireland',     PT: 'Portugal',
  PL: 'Poland',         CZ: 'Czechia',        RO: 'Romania',     GR: 'Greece',
  CA: 'Canada',         MX: 'Mexico',         BR: 'Brazil',      AR: 'Argentina',
  CL: 'Chile',          CO: 'Colombia',       AE: 'UAE',         SA: 'Saudi Arabia',
  IL: 'Israel',         TR: 'Türkiye',        ZA: 'South Africa',NG: 'Nigeria',
  KE: 'Kenya',          EG: 'Egypt',          IN: 'India',       SG: 'Singapore',
  HK: 'Hong Kong',      JP: 'Japan',          KR: 'South Korea', CN: 'China',
  AU: 'Australia',      NZ: 'New Zealand',    PH: 'Philippines', ID: 'Indonesia',
  MY: 'Malaysia',       TH: 'Thailand',       VN: 'Vietnam',     UA: 'Ukraine'
};

function countryName(code) {
  if (!code) return '';
  return COUNTRIES[code] || code;
}
