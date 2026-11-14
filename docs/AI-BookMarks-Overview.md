# AI BookMarks — development to hosting

Built by [Divyansh Varanasi](https://github.com/varanasi0403).

[Live app](https://ai-bookmarks-rss.ai-bookmarks-cloud.workers.dev/) · [GitHub repository](https://github.com/varanasi0403/ai-bookmarks)

| Component | What we used |
| --- | --- |
| Interface | HTML, CSS and vanilla JavaScript; dark mode and responsive laptop/phone layouts. |
| RSS collection | Official article/blog RSS feeds; GitHub release feeds excluded. Python/httpx/feedparser locally, JavaScript/fast-xml-parser in the cloud. |
| Local development | FastAPI + Uvicorn + SQLite; Python dependencies isolated in `.venv`. |
| Daily updates | Native Cloudflare Cron checks one source every two minutes; full rotation about 18 minutes. Works with the laptop off. |
| News history | D1 retains collected articles; the reader serves up to 5,000 recent blog/article entries. Failed sources preserve history. GitHub snapshots remain a manual backup. |
| Hosting | Cloudflare Workers serves the JavaScript API and static frontend over HTTPS. Sync collects fresh RSS data, then reloads D1 without stale snapshot caches. |
| Database | Cloudflare D1 stores news, source checks, scheduler heartbeat, AI summaries and daily usage. |
| Saved articles | Browser localStorage; no login. Saved/read state is separate on each browser/device. |
| Optional AI summary | Groq hosts the open-weight `openai/gpt-oss-20b` model; summarizes the publisher excerpt on request. Results cached; site-wide limit of 20 new model calls per UTC day. |
| Secrets | Groq key stored as a Cloudflare secret, never included in frontend or Git. No ChatGPT subscription or LiteLLM proxy is used. |
| Deployment tools | Wrangler and Node packages installed inside the project, with a pnpm lockfile; Git over SSH to your existing `varanasi0403` account. |

**Flow:** RSS feeds → native Cloudflare collector → D1 → responsive reader. Sync triggers real collection, with a shared ten-minute cooldown per source. Optional summary → Groq → D1 cache → reader.

## Cost

**₹0 while using the current free plans within their limits.** No paid Cloudflare plan was enabled. Standard GitHub Actions runners are free for this public repository. Keep Groq on its Free plan; the app has no paid-provider fallback. The API key alone does not reveal or prove your Groq billing tier.

Free hosting is not unlimited: quota exhaustion or a provider outage can pause requests or summaries. Upgrading a provider account to a paid plan can create charges; the app's 20-call cap is a usage safeguard, not a provider billing guarantee. RSS reading does not depend on Groq.

Official references: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [Groq billing](https://console.groq.com/docs/billing-faqs).

## Practical limits

The original GitHub daily schedule missed its first event, so production now uses native Cloudflare Cron. The app shows the latest successful source check and per-source status; the API exposes a separate scheduler heartbeat. Exact schedule timing is not guaranteed. Publishers control feed retention, so no RSS reader can guarantee every historical post. The cloud reader keeps preferences and bookmarks in the current browser, without cross-device sync.

Verified before migration: push-triggered GitHub workflow, live AI summary and cached summary response. The push run did not verify the original daily schedule. The native collector and manual Sync were then deployed and tested against real publisher feeds. The repository is now in the original account; no transfer email is needed.

Update: automatic collection now uses Cloudflare; GitHub Actions remains only a snapshot backup. Keep free provider plans and quotas in mind.

Native schedule verified on 14 November 2026 at 11:54 IST: an automatic Cloudflare event successfully checked NVIDIA Developer and processed eight eligible entries. This was a real scheduled event, independent of manual Sync. Manual collection and article-only filtering were also verified on the live site.
