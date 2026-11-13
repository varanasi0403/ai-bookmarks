# AI BookMarks — setup overview

**Built by:** [Divyansh Varanasi](https://github.com/varanasi0403)

**Live app:** [AI BookMarks](https://ai-bookmarks-rss.ai-bookmarks-cloud.workers.dev/)

| Component | What we used |
| --- | --- |
| Interface | HTML, CSS and vanilla JavaScript; dark mode; laptop and phone layouts. |
| RSS collection | Python, `httpx` and `feedparser`; 22 official RSS/Atom sources. |
| Personalization | Keyword-based topic filtering, source selection, ranking and URL deduplication. |
| Local development | FastAPI + Uvicorn; SQLite; Python packages isolated in `.venv`. |
| Hosted API | JavaScript on Cloudflare Workers; public news is read-only. |
| Hosted news storage | Cloudflare D1, a persistent serverless SQLite database. |
| Saved articles | Browser `localStorage`; private to each browser, without sign-in or cross-device sync. |
| Daily collection | GitHub Actions workflow prepared for about 07:00 IST; activation is pending GitHub setup. |
| Deployment | Project-local Wrangler in `cloud/node_modules`; HTTPS on Cloudflare's `workers.dev` domain. |
| AI summaries | Not enabled. Publisher excerpts work independently of any model or subscription. |

**Development → hosting:** local Python app → Git repository → built frontend + Worker → D1 database → public HTTPS URL.

## Cost

**No payment is required for this setup while it stays within the free allowances.** No paid Cloudflare plan was enabled. Cloudflare's Free plan has usage limits; D1 queries stop when its free daily quota is exhausted. GitHub Actions uses your account's shared included allowance; enabled paid overage or later plan upgrades could create charges. This is not unlimited hosting or a permanent pricing guarantee.

Sources: [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

## Remaining step

GitHub has requested transfer of the private `ai-brief` repository from `varnasi0403-afk` to `varanasi0403`. The receiving account must accept it. The live site already works with the laptop off; automatic daily refresh is not yet active until the workflow and its secret/URL are configured and its first run succeeds.
