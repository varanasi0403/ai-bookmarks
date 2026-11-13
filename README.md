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

Articles, bookmarks, read state, preferences, and the last collection time are stored in `data/signal.db`. Removing AI integration does not remove any existing articles or bookmarks. Refreshes add new URLs without resetting saved/read state. Collected history is not automatically deleted; **All collected** includes older stored articles. The default screen shows the past seven days and eight diverse picks, with **Show more updates** for more.

The scheduler works while the server is running and awake. If the laptop sleeps or the process stops, collection resumes when it runs again and refreshes if overdue. It cannot guarantee catching every post published while offline: publishers can limit how much history their feeds retain. Each collection inspects up to 35 entries per source and accepts dated entries from the past 30 days. Missing publication dates are labeled and use collection time for filtering. Source errors appear under **Sources**; existing data stays available.

## Sources and excerpts

22 official RSS/Atom feeds: OpenAI, Hugging Face, Google Research, NVIDIA Developer, LangChain releases, Oracle AI, Oracle Cloud, PyTorch releases, vLLM releases, Transformers releases, Google DeepMind, Google AI, Google Gen AI SDK, Anthropic SDK, Claude Code, Ollama, Open WebUI, LiteLLM releases, OmniRoute, LM Studio SDK, OpenRouter Blog, and OpenRouter SDK.

LiteLLM is a news source only, just like the other projects. SDK feeds report SDK releases, not every vendor announcement. Source filtering is configurable without deleting previously collected history. Oracle is one optional source family; source diversity prevents one publisher from dominating the first picks.

Cards show cleaned publisher excerpts, shortened to 440 characters, with **Read original** links to the complete article. Some feeds provide only a title. Relevance is a keyword heuristic. Tracking URL parameters are removed to reduce duplicates; related coverage at different URLs is not merged.

## Laptop and phone

The app serves your local network on port 8080 by default. On a phone connected to the same Wi-Fi, open `http://<laptop-LAN-IP>:8080`. Both devices use the same SQLite reading list and preferences. The layout adapts to phone widths and a 13-inch MacBook. Set `SIGNAL_HOST=127.0.0.1` before `sh run.sh` for laptop-only access.

## Cloud hosting

The [live cloud reader](https://ai-bookmarks-rss.ai-bookmarks-cloud.workers.dev/) uses Cloudflare Workers, GitHub-hosted RSS snapshots, D1 summary caching, and a daily GitHub Actions collector. The first cloud collection succeeded. See [cloud/README.md](cloud/README.md) and the [component and cost overview](docs/AI-BookMarks-Overview.md).

The public edition shares news while keeping bookmarks/read state/preferences in each visitor's browser. The local edition continues to share a personal SQLite reading list across your devices on the same Wi-Fi. RSS collection does not depend on AI; optional summaries use the open-weight GPT-OSS 20B model hosted by Groq. Results are cached with a site-wide cap of 20 new calls per UTC day.

## Checks and data

```sh
.venv/bin/python -m unittest discover -s tests -v
```

Use one Uvicorn process to avoid duplicate scheduled work. Back up `data/signal.db` with the server stopped. `SIGNAL_DB` can point to persistent storage. Existing databases from the AI-enabled version remain compatible; unused legacy summary columns are ignored and never returned to the UI. No data migration deletes collected articles.
