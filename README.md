# Signal · Your AI ecosystem RSS reader

A dark-mode RSS reader for AI applications, model releases and weights, libraries, training, system design, local AI, routing tools, and optional Oracle / OCI coverage. It uses publisher excerpts and keyword filtering. No language model, AI summary, subscription, or API key is required.

## Run

```sh
cd /Users/divyanshvaranasi/Dev/ai-brief
sh setup.sh
sh run.sh
```

Open http://localhost:8080. The app has no password. Dependencies stay in `.venv` and do not change global Python packages. The app does not run or use a LiteLLM proxy. An old ignored `.proxy-venv` from previous setup can be removed manually if you want to reclaim disk space.

## Daily updates and retained history

Collection runs on startup when due, every 24 hours by default, and whenever you click **Refresh briefing**. Change the interval (1–168 hours), topics, and enabled source feeds under **Tune your signal**.

Articles, bookmarks, read state, preferences, and the last collection time are stored in `data/signal.db`. Removing AI integration does not remove any existing articles or bookmarks. Refreshes add new URLs without resetting saved/read state. Collected history is not automatically deleted; **All collected** includes older stored articles. The default screen shows the past seven days and eight diverse picks, with **Show more signals** for more.

The scheduler works while the server is running and awake. If the laptop sleeps or the process stops, collection resumes when it runs again and refreshes if overdue. It cannot guarantee catching every post published while offline: publishers can limit how much history their feeds retain. Each collection inspects up to 35 entries per source and accepts dated entries from the past 30 days. Missing publication dates are labeled and use collection time for filtering. Source errors appear under **Sources**; existing data stays available.

## Sources and excerpts

22 official RSS/Atom feeds: OpenAI, Hugging Face, Google Research, NVIDIA Developer, LangChain releases, Oracle AI, Oracle Cloud, PyTorch releases, vLLM releases, Transformers releases, Google DeepMind, Google AI, Google Gen AI SDK, Anthropic SDK, Claude Code, Ollama, Open WebUI, LiteLLM releases, OmniRoute, LM Studio SDK, OpenRouter Blog, and OpenRouter SDK.

LiteLLM is a news source only, just like the other projects. SDK feeds report SDK releases, not every vendor announcement. Source filtering is configurable without deleting previously collected history. Oracle is one optional source family; source diversity prevents one publisher from dominating the first picks.

Cards show cleaned publisher excerpts, shortened to 440 characters, with **Read original** links to the complete article. Some feeds provide only a title. Relevance is a keyword heuristic. Tracking URL parameters are removed to reduce duplicates; related coverage at different URLs is not merged.

## Laptop and phone

The app serves your local network on port 8080 by default. On a phone connected to the same Wi-Fi, open `http://<laptop-LAN-IP>:8080`. Both devices use the same SQLite reading list and preferences. The layout adapts to phone widths and a 13-inch MacBook. Set `SIGNAL_HOST=127.0.0.1` before `sh run.sh` for laptop-only access.

## Later: a shared URL

Public hosting is a separate next step. This project is not deployed to a free hosting service yet. A deployment needs a running service for collection and persistent storage for `SIGNAL_DB`; an ephemeral or sleeping free instance alone cannot provide reliable daily collection and saved history. A public multi-user edition should keep bookmarks/preferences separate per visitor and restrict global collection/settings actions. The current local edition deliberately shares one personal reading list and settings across devices.

The RSS-only approach needs no model hosting. If AI features become useful later, they can be added as an optional enhancement without making RSS collection depend on them. Choose a provider and hosting plan at that time rather than assuming free cloud inference or always-on hosting is available.

## Checks and data

```sh
.venv/bin/python -m unittest discover -s tests -v
```

Use one Uvicorn process to avoid duplicate scheduled work. Back up `data/signal.db` with the server stopped. `SIGNAL_DB` can point to persistent storage. Existing databases from the AI-enabled version remain compatible; unused legacy summary columns are ignored and never returned to the UI. No data migration deletes collected articles.
