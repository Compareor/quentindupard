# Deploying

## Where things stand

`quentindupard.com` currently serves the **old** site from GitHub Pages. The
rebuild lives on the `redesign/liquid-glass` branch and is not live.

Measured page weight is **193 KB uncompressed across 6 requests**, FCP ~300ms
locally. It is not a heavy site — if it feels slow anywhere, that is animation
timing or the host, not payload.

---

## Two ways to ship

### Option A — GitHub Pages (today, no new accounts)

Everything except the four `/api/*` features works on your current host.

1. Open a PR from `redesign/liquid-glass` and merge to `main`.
2. Done. Pages redeploys automatically.

What works: the whole site, the newsletter signup, and the mailbox contact form
(both go to your existing Formspree endpoint `f/xeenaboo`).

What degrades, visibly and honestly:

| Feature | Without Functions |
|---|---|
| AI-me | Answers from 5 cached examples, and says so |
| Live stats | Shows the visitor's own session only, and says so |
| Visitor line | Falls back to the static eyebrow |
| `/services`, `/contact` | Return 404 instead of 410 |

### Option B — Cloudflare Pages (everything on)

1. **Workers & Pages → Create → Pages → Connect to Git** → `Compareor/quentindupard`, branch `main`.
2. Build settings:

   | Field | Value |
   |---|---|
   | Framework preset | None |
   | Build command | `npm install` |
   | Build output directory | `/` |

   `npm install` exists only to pull `@anthropic-ai/sdk` for the functions.

3. **Settings → Functions → Compatibility flags** → add `nodejs_compat`.
4. **Settings → Environment variables → Production**:

   | Name | Value | Type |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | from console.anthropic.com | **Encrypted** |

5. **Workers & Pages → KV** → create `qd-stats` and `qd-rate-limit`, then bind
   them under **Settings → Functions → KV namespace bindings**:

   | Variable | Namespace |
   |---|---|
   | `STATS` | `qd-stats` |
   | `RATE_LIMIT` | `qd-rate-limit` |

6. **Custom domains** → add `quentindupard.com`, follow the DNS steps.
7. Turn **off** GitHub Pages so there is only one live origin.

---

## After the domain moves

- **Google Search Console**: request removal for `/services` and `/contact`.
  They return 410, but a removal request forces a recrawl instead of waiting
  weeks. Submit `sitemap.xml` while you are there.
- **Set a monthly spend limit** on your Anthropic account. The 12-per-IP-per-hour
  cap in `functions/api/ask.js` protects against one visitor, not the internet.

---

## Things that still need you

| What | Where | Why |
|---|---|---|
| Stripe Payment Link | `assets/home.js`, search `REPLACE_WITH_YOUR_PAYMENT_LINK` | The €5/month AI-me paywall points at a placeholder. Create a Payment Link in Stripe (no code, and card details never touch this site). |
| Real recommendations | `assets/content.js` | The mailbox entries are illustrative. Your LinkedIn recommendations are real and worth more. |
| Result numbers | `index.html`, Act 03 | The carousel describes what you did but not what changed. |
| Research images | `assets/research/*.svg` | Glass placeholders sized 1200×630. Replace the file, keep the name. |
| Corpus depth | `llms-full.txt` | This is what AI-me answers from. More of your real opinions = better answers. |

---

## Notes on the free tier

AI-me allows 5 questions, then shows the €5/month prompt. The counter is in
`localStorage`, so a determined visitor can clear it. That is deliberate: for a
€5 product the limit is a nudge, not DRM. Real enforcement needs accounts behind
`/api/ask`, which is a server-side change and a bigger piece of work.

`functions/api/contact.js` is currently **unused** — the form posts to Formspree
instead, because that works on any host. It is left in place in case you want to
drop Formspree later; it sends via Resend and needs `RESEND_API_KEY`.

---

## Cost

AI-me uses `claude-opus-5`: roughly **€0.03 per question** at ~4k input tokens
(the corpus) and ~400 output. The model is one line in `functions/api/ask.js`
(`MODEL`) if you would rather run `claude-sonnet-5` for about a fifth of that.
