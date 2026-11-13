# AI BookMarks — development to hosting

Built by [Divyansh Varanasi](https://github.com/varanasi0403).

[Live app](https://ai-bookmarks-rss.ai-bookmarks-cloud.workers.dev/) · [GitHub repository](https://github.com/varanasi0403/ai-bookmarks)

| Component | What we used |
| --- | --- |
| Interface | HTML, CSS and vanilla JavaScript; dark mode and responsive laptop/phone layouts. |
| RSS collection | Python, httpx and feedparser; 22 official RSS/Atom feeds, topic filtering and URL deduplication. |
| Local development | FastAPI + Uvicorn + SQLite; Python dependencies isolated in `.venv`. |
| Daily updates | GitHub Actions, scheduled around 07:00 IST; runs without your laptop. First cloud collection succeeded. |
| News history | Versioned JSON snapshots in the public GitHub repo; keeps up to 5,000 entries in the active feed. Failed collections retain the previous feed. |
| Hosting | Cloudflare Workers serves the JavaScript API and static frontend over HTTPS; news snapshots are cached. |
| Database | Cloudflare D1 stores cached AI summaries and daily usage; initial news database provides an upstream-error fallback. |
| Saved articles | Browser localStorage; no login. Saved/read state is separate on each browser/device. |
| Optional AI summary | Groq hosts the open-weight `openai/gpt-oss-20b` model; summarizes the publisher excerpt on request. Results cached; site-wide limit of 20 new model calls per UTC day. |
| Secrets | Groq key stored as a Cloudflare secret, never included in frontend or Git. No ChatGPT subscription or LiteLLM proxy is used. |
| Deployment tools | Wrangler and Node packages installed inside the project, with a pnpm lockfile; Git over SSH to your existing `varanasi0403` account. |

**Flow:** RSS feeds → scheduled Python collector → GitHub JSON snapshots → Cloudflare Worker → responsive reader. Optional summary → Groq → D1 cache → reader.

## Cost

**₹0 while using the current free plans within their limits.** No paid Cloudflare plan was enabled. Standard GitHub Actions runners are free for this public repository. Keep Groq on its Free plan; the app has no paid-provider fallback. The API key alone does not reveal or prove your Groq billing tier.

Free hosting is not unlimited: quota exhaustion or a provider outage can pause requests or summaries. Upgrading a provider account to a paid plan can create charges; the app's 20-call cap is a usage safeguard, not a provider billing guarantee. RSS reading does not depend on Groq.

Official references: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [Groq billing](https://console.groq.com/docs/billing-faqs).

## Practical limits

GitHub can delay scheduled jobs; public-repository schedules can be disabled after 60 days without repository activity. The app shows the latest successful collection time and per-source status. Publishers control feed retention, so no RSS reader can guarantee every historical post. The cloud reader keeps preferences and bookmarks in the current browser, without cross-device sync.

Verified: first daily workflow completed successfully; live AI summary generated successfully; repeated request returned its cached result. The repository is now in the original account; no transfer email is needed.
