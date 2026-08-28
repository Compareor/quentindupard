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

## The content editor

`/admin` edits the fort's folders and the mailbox. Everything else on the site
is a file in this repo.

1. Set the password. It is a secret, not a variable:

   ```
   npx wrangler secret put ADMIN_PASSWORD
   ```

   Or in the dashboard: **Workers & Pages -> quentindupard -> Settings ->
   Variables and Secrets -> Add -> Secret**. Make it long. There is no second
   factor and no lockout beyond eight wrong guesses per IP per hour, so the
   length of the password IS the security.

2. Open `https://quentindupard.com/admin`, unlock, edit, Save.

Notes worth knowing:

- Saving writes one KV value. The site ships with the same content baked into
  `assets/content.js`, and only overlays the saved version when it exists, so a
  KV outage or an empty store falls back to what is in the repo rather than to
  an empty fort.
- **Reset to shipped** reloads the repo defaults into the editor. It does not
  save until you press Save.
- Changing `ADMIN_PASSWORD` signs out every open session, because the session
  cookie is signed with the password itself.
- The page is `noindex` and disallowed in `robots.txt`.
- Attachments and PDFs point at files already in `/assets/docs`. There is no
  upload — adding a new PDF means committing the file, then pointing an entry
  at it.

---

## Things that still need you

| What | Where | Why |
|---|---|---|
| Promotion codes on the Payment Link | Stripe dashboard | **`QD50` cannot work until this is on.** Payment Links ship with promotion codes disabled, which hides the "Add promotion code" field entirely and makes `?prefilled_promo_code=` a no-op. Open the Payment Link, and under its options enable **Allow promotion codes**. |
| Real recommendations | `assets/content.js` | The mailbox entries are illustrative. Your LinkedIn recommendations are real and worth more. |
| Result numbers | `index.html`, Act 03 | The carousel describes what you did but not what changed. |
| Research images | `assets/research/*.svg` | Glass placeholders sized 1200×630. Replace the file, keep the name. |
| Corpus depth | `llms-full.txt` | This is what AI-me answers from. More of your real opinions = better answers. |

---

## Notes on the KV budget

Cloudflare's free KV tier allows **1,000 writes and 1,000 list operations a
day, account-wide** — shared by the stats counters, the AI-me rate limit, and
admin saves.

Both of the things that used to spend that budget carelessly are fixed:

- `/api/stats` reads five documents and does one list, regardless of how much
  data has accumulated. It used to list eight prefixes and issue a `get` per
  key — measured at 192 gets and 9 lists on two days of data.
- `/api/track` writes one document per batch instead of one key per counter,
  taking a visit from roughly 40 writes to about 3.

The first request to `/api/stats` after this change folds the old per-key
counters into `agg:v1:legacy` and sets `agg:v1:migrated`. That one request is
expensive; every one after it is not. The old keys are left in place because
deleting them would spend the daily delete budget for no benefit.

If you ever do run out of writes, `/api/ask` now falls back to a much tighter
per-isolate limit rather than becoming uncapped. Keep a monthly spend limit on
the Anthropic account regardless — that is the real backstop.

---

## Notes on the free tier

AI-me allows 5 questions, then shows the $10/month prompt. The counter is in
`localStorage`, so a determined visitor can clear it. That is deliberate: for a
$10 product the limit is a nudge, not DRM. Real enforcement needs accounts behind
`/api/ask`, which is a server-side change and a bigger piece of work.

`functions/api/contact.js` is currently **unused** — the form posts to Formspree
instead, because that works on any host. It is left in place in case you want to
drop Formspree later; it sends via Resend and needs `RESEND_API_KEY`.

---

## Cost

AI-me uses `claude-opus-5`: roughly **€0.03 per question** at ~4k input tokens
(the corpus) and ~400 output. The model is one line in `functions/api/ask.js`
(`MODEL`) if you would rather run `claude-sonnet-5` for about a fifth of that.

---

## Translations

The site is published in English, French and Spanish. English is the source;
`/fr/` and `/es/` are generated files, committed to the repo, so the deploy
stays a plain static upload and a broken translation tool can never take the
live site down.

```bash
python3 tools/i18n/extract.py    # English copy -> i18n/en.json
python3 tools/i18n/build.py      # i18n/fr.json + es.json -> /fr/ and /es/
python3 tools/i18n/sitemap.py    # every page x every language, with hreflang
python3 tools/i18n/runtime.py    # i18n/runtime.json -> assets/i18n.js
python3 tools/i18n/verify.py     # hreflang reciprocity, canonicals, dead links
python3 tools/i18n/selftest.py   # proves the rewriter is byte-exact
```

**After editing any English copy**, run `extract.py` then `build.py`. Keys are
hashes of the English sentence, so changing an English sentence retires its old
key and the translation is reported missing rather than silently left stale.
Untranslated strings fall back to English and are counted in the build output.

**To fix a translation**, edit `i18n/fr.json` or `i18n/es.json` directly (the
key is the hash) or write a `{english: translation}` batch and run
`apply.py fr batch.json`, which validates that the markup survived.

Strings that live in JavaScript are in `i18n/runtime.json` and reach the page
through `QD.t()` instead, because the markup carrying them does not exist until
the script runs.

Language selection: the Worker reads `Accept-Language` on `/` only, never
redirects a crawler, and answers 302 with `Vary`. Picking a language from the
switcher writes `qd_lang`, which always wins. Deep links are never redirected —
they carry their own language, and redirecting them would fight the hreflang.

---

## IndexNow

Bing, Yandex and Seznam accept a push instead of waiting for their own crawl
schedule. Google does not participate, so this complements Search Console
rather than replacing it.

```bash
python3 tools/indexnow.py --dry-run     # show what would be sent
python3 tools/indexnow.py               # every URL in sitemap.xml
python3 tools/indexnow.py --urls https://quentindupard.com/research/x/
python3 tools/indexnow.py --withdrawn   # the 410'd pieces, so they get dropped
```

The key file at `/c269fe0f232f4c0b98944cadd64fdb68.txt` is how a submission is
verified as yours. **It has to stay deployed**: delete it and every submission
is rejected with a 403. It is served as `text/plain` and `noindex` via
`_headers`.

Run it after publishing an article, and after withdrawing one — submitting a
URL that now returns 410 is the fastest way to get a dead page dropped, because
the crawler comes to look rather than waiting weeks to notice.
