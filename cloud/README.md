# AI BookMarks hosted edition

[Live reader](https://ai-bookmarks-rss.ai-bookmarks-cloud.workers.dev/) · [Component and cost overview](../docs/AI-BookMarks-Overview.md)

Cloudflare Workers serves the dark responsive reader, collects official article/blog RSS feeds, and stores history and AI summary caches in D1. GitHub release feeds are excluded. Personal bookmarks, read state and preferences remain in each browser, without cross-device sync.

## Automatic collection and manual sync

A native Cloudflare Cron Trigger runs every two minutes and checks one source per invocation. The current catalog completes a rotation in approximately 18 minutes. A shared ten-minute cooldown per source prevents repeated fetching by simultaneous readers. The collector parses at most ten recent entries per check, uses stable URL IDs, and preserves previous history when a publisher is unavailable. Publisher feed retention still limits what can be recovered after a long outage.

**Sync latest feed** requests actual collection for every enabled source with three concurrent requests, shows progress, and then reloads D1 with browser caching disabled. Recently checked sources reuse their existing articles; the completion message explains the cooldown. Source failures are shown honestly and do not delete old articles. The Feeds checked timestamp shows the latest successful source check. The sync message reports how many new articles the check added to D1. A notice appears if successful checks are more than 90 minutes behind.

`/api/status` exposes `scheduler_last_run` and `scheduler_last_result`, recorded by the scheduled handler independently of manual sync. Check these fields to verify automatic execution. Cloudflare may take up to 15 minutes to propagate a new Cron Trigger. Exact execution times are not a service guarantee.

GitHub Actions is now a **manual/push-triggered RSS snapshot backup**, rather than the production scheduler. The original daily GitHub trigger missed its first scheduled event. A successful push-triggered workflow did not prove scheduled execution. Production collection no longer depends on GitHub Actions or a GitHub token.

## Build and deploy

Python packages remain in `.venv`; Node packages, including `fast-xml-parser`, live in `cloud/node_modules`. With Node 22+ and pnpm available:

```sh
pnpm --dir cloud install --frozen-lockfile
.venv/bin/python cloud/scripts/export_catalog.py
node cloud/scripts/build.mjs
python3 cloud/manage.py d1 migrations apply DB --remote
python3 cloud/manage.py deploy
```

Reuse the D1 binding in `wrangler.jsonc`. Deployment uses the existing project-local Cloudflare login. `manage.py` keeps configuration/logs project-local. Rebuild generated assets before deploying. `wrangler.jsonc` declares the native schedule, so deployments preserve it.

## Optional summaries

Groq hosts open-weight `openai/gpt-oss-20b`. Summaries use the article title and at most 1,500 characters of the publisher excerpt; they do not read the full article. Store the Groq Free-plan key with `python3 cloud/manage.py secret put GROQ_API_KEY`. Never commit keys. RSS works without Groq. D1 caches summaries and atomically limits new provider calls to 20 per UTC day across all visitors. Failed provider calls count toward that allowance; there is no paid fallback.

## Verification and cost

```sh
node --test cloud/tests/*.test.mjs
.venv/bin/python -m unittest discover -s tests -q
```

Verify native scheduled execution using `/api/status`, source timestamps using the Sources screen, and manual collection using the actual Sync button. Keep Cloudflare and Groq on Free plans. Requests, CPU, D1 reads/writes and Groq have limits. Quotas can stop service, and upgrading an account to a paid plan can incur charges. The collector processes one source per scheduled invocation to keep individual CPU usage small. See the overview for official pricing references.

Verified on 14 November 2026: native scheduled event at 06:24 UTC / 11:54 IST completed successfully, with its heartbeat and source result visible through `/api/status`.
