# AI BookMarks · Your AI ecosystem RSS reader

A dark-mode RSS reader for AI applications, model releases and weights, libraries, training, system design, local AI, routing tools, and optional Oracle / OCI coverage. It uses publisher excerpts and keyword filtering. RSS reading requires no language model or API key. The hosted app also offers optional Groq-powered summaries.

## Run

```sh
cd /Users/divyanshvaranasi/Dev/ai-brief
sh setup.sh
sh run.sh
```

Open http://localhost:8080. The app has no password. Dependencies stay in `.venv` and do not change global Python packages. The app does not run or use a LiteLLM proxy. An old ignored `.proxy-venv` from previous setup can be removed manually if you want to reclaim disk space.

## Daily updates and retained history

Collection runs on startup when due, every 24 hours by default, and whenever you click **Refresh briefing**. Change the interval (1–168 hours), topics, and enabled source feeds under **Customize AI BookMarks**.

Articles, bookmarks, read state, preferences, and the last collection time are stored in `data/signal.db`. Removing AI integration does not remove any existing articles or bookmarks. Refreshes add new URLs without resetting saved/read state. Collected history is not automatically deleted; **All collected** includes older stored articles. The default screen shows the past seven days and the eight newest articles, with **Show more updates** for more.

The scheduler works while the server is running and awake. If the laptop sleeps or the process stops, collection resumes when it runs again and refreshes if overdue. It cannot guarantee catching every post published while offline: publishers can limit how much history their feeds retain. Each collection inspects up to 35 entries per source and accepts dated entries from the past 30 days. Missing publication dates are labeled and use collection time for filtering. Source errors appear under **Sources**; existing data stays available.

## Sources and excerpts

The feed now includes official articles and blogs from OpenAI, Hugging Face, Google Research, NVIDIA Developer, Oracle AI/Cloud, Google DeepMind, Google AI and OpenRouter. GitHub repository release feeds have been removed. Oracle is optional. Existing saved articles remain available.

Cards show cleaned publisher excerpts with original article links. Some publishers provide only a title. Topic relevance is a keyword heuristic; tracking URL parameters are removed to reduce duplicates. Related coverage at different URLs is not merged.

## Laptop and phone

The app serves your local network on port 8080 by default. On a phone connected to the same Wi-Fi, open `http://<laptop-LAN-IP>:8080`. Both devices use the same SQLite reading list and preferences. The layout adapts to phone widths and a 13-inch MacBook. Set `SIGNAL_HOST=127.0.0.1` before `sh run.sh` for laptop-only access.

## Cloud hosting

The [live cloud reader](https://ai-bookmarks-rss.ai-bookmarks-cloud.workers.dev/) uses Cloudflare Workers + D1. Native Cloudflare Cron checks one source every two minutes, completing a rotation in about 18 minutes. **Sync latest feed** requests actual RSS collection with a one-minute per-source limit for repeat manual syncs, then reloads the latest articles. GitHub Actions is a manual/push-triggered snapshot backup; production collection does not depend on its scheduler.

Saved/read state and preferences belong to each browser. Optional summaries use open-weight GPT-OSS 20B via Groq, cached with a site-wide 20-call daily cap. See [cloud/README.md](cloud/README.md) and the [component/cost overview](docs/AI-BookMarks-Overview.md).

## Checks and data

```sh
.venv/bin/python -m unittest discover -s tests -v
```

Use one Uvicorn process to avoid duplicate scheduled work. Back up `data/signal.db` with the server stopped. `SIGNAL_DB` can point to persistent storage. Existing databases from the AI-enabled version remain compatible; unused legacy summary columns are ignored and never returned to the UI. No data migration deletes collected articles.
