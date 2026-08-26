# Deploying to Cloudflare Pages

The site currently runs on GitHub Pages, which is static-only. The two features
on the new homepage — visitor resolution and the queryable brain — need an edge
runtime, so the site has to move. Cloudflare Pages is free, keeps the same repo
and `git push` workflow, and is the only host that hands you the visitor's
network organisation without a paid third-party lookup.

Until this migration happens the site still works: both features detect the
missing endpoints and fall back (the visitor card says what it can't read, and
the ask box answers from a small set of cached examples).

---

## 1. Create the Pages project

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**
2. Pick `Compareor/quentindupard`, branch `main`
3. Build settings:

   | Field | Value |
   |---|---|
   | Framework preset | None |
   | Build command | `npm install` |
   | Build output directory | `/` |

   `npm install` exists only to pull in `@anthropic-ai/sdk` for the functions —
   there is no build step for the site itself.

4. Under **Settings → Functions → Compatibility flags**, add `nodejs_compat`.
   The Anthropic SDK needs it on the Workers runtime.

## 2. Add the API key

**Settings → Environment variables → Production** → add:

| Name | Value | Type |
|---|---|---|
| `ANTHROPIC_API_KEY` | your key from console.anthropic.com | **Encrypted** |

Set it as Encrypted, not Plaintext. Add it to the Preview environment too if you
want the brain working on branch deploys.

## 3. Add the stats namespace (required for /stats)

The live stats page needs somewhere to keep its counters. Until this exists,
`/stats/` works but shows only the current visitor's session and says so.

1. **Workers & Pages → KV** → **Create namespace**, name it `qd-stats`
2. **Your Pages project → Settings → Functions → KV namespace bindings** → add:

   | Variable name | KV namespace |
   |---|---|
   | `STATS` | `qd-stats` |

`/api/track` only accepts events from a fixed allow-list and writes counters —
never an event log, never an IP. `/api/stats` reads those counters back. Nothing
in the store identifies a person; the visitor counter is a hashed random id with
a 90-day expiry.

## 4. Add rate limiting (recommended)

`/api/ask` calls a paid API on behalf of anonymous visitors, so it needs a cap
before it goes public.

1. **Workers & Pages → KV** → **Create namespace**, name it `qd-rate-limit`
2. **Your Pages project → Settings → Functions → KV namespace bindings** → add:

   | Variable name | KV namespace |
   |---|---|
   | `RATE_LIMIT` | `qd-rate-limit` |

Without this binding the endpoint still works but is uncapped — fine for a
staging deploy, not for production. The limit is 12 questions per IP per hour;
change `MAX_PER_WINDOW` in `functions/api/ask.js` to adjust.

Also set a **monthly spend limit** on your Anthropic account. Rate limiting caps
one visitor; a spend limit caps the whole internet.

## 5. Move the domain

1. Pages project → **Custom domains** → **Set up a custom domain** →
   `quentindupard.com`
2. Follow the DNS instructions Cloudflare gives you. If the domain's nameservers
   already point at Cloudflare this is one click; otherwise you'll update the
   record at your registrar.
3. Once the Cloudflare deploy serves the domain, **turn off GitHub Pages** in
   the repo settings so there is only one live origin.

## 6. Verify

```bash
curl -s https://quentindupard.com/api/visitor | python3 -m json.tool
```

Should return your city, country and network organisation. Then ask the brain a
question on the homepage — the answer should stream in a word at a time rather
than appearing all at once, which is how you know it's hitting the real endpoint
and not the offline fallback.

---

## Cost

The brain uses `claude-opus-5`. At roughly 4k input tokens (the corpus) and
400 output tokens per question, that's about **$0.03 per question**. With the
12/hour cap and normal personal-site traffic this is a rounding error, but the
model is one line in `functions/api/ask.js` (`MODEL`) if you'd rather run
`claude-sonnet-5` or `claude-haiku-4-5` for roughly a fifth of the cost.

Server-side refusal fallback is enabled, so a question that trips a safety
classifier gets routed to a fallback model instead of returning nothing.

## What the brain knows

`/api/ask` grounds its answers in `llms-full.txt`. That file is currently
written for the old consulting positioning — **rewriting it is the highest-value
thing you can do for answer quality**, since it's the entire corpus. Add your
provider audit notes, your GTM frameworks, and the opinions you actually hold,
and the answers stop being generic immediately.
