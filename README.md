# Signal · Your AI engineering briefing

A personal AI news desk for an AI/ML software engineer: applications, agents, libraries, model weights, training, system design, and Oracle / OCI. Responsive browser UI, SQLite reading list, source links, per-topic filtering, search, read state, and adjustable collection interval. No Node or global Python packages required.

## Start

```sh
cd /Users/divyanshvaranasi/Dev/ai-brief
./setup.sh
./run.sh
```

Open http://127.0.0.1:8080. Your generated app password is in `.env`. Setup only installs packages inside `.venv`. Without a configured proxy, the app still collects real publisher excerpts and labels them honestly. It never inserts demo news.

## Connect your ChatGPT subscription through LiteLLM

LiteLLM documents a `chatgpt/` subscription provider with OAuth login: https://docs.litellm.ai/docs/providers/chatgpt/ . This is separate from paid OpenAI API billing. Use a ChatGPT account and model supported by that provider and your plan. Subscription quotas apply; availability and provider compatibility can change.

In a terminal, install the proxy in its own environment:

```sh
cd /Users/divyanshvaranasi/Dev/ai-brief
python3 -m venv .proxy-venv
.proxy-venv/bin/python -m pip install 'litellm[proxy]>=1.109.0,<2' python-dotenv
.proxy-venv/bin/python setup_proxy.py
```

Follow the displayed device-code login in your browser. Device-code login must be allowed in your ChatGPT security settings (or by your workspace administrator). Login tokens stay in this project's ignored `.tokens/` directory. `setup_proxy.py` writes a random local proxy key into the ignored `.env`. Do not share these files.

Then start the proxy in one terminal:

```sh
./run-proxy.sh
```

Restart `./run.sh` in another terminal and click **Refresh briefing**. `litellm.yaml` maps `daily-brief` to `chatgpt/gpt-6.1-sol`; change it if your account requires another supported model. Keep the proxy on loopback and use a single worker. If login expires or gets revoked, rerun `setup_proxy.py`, restart the proxy, and refresh. The app shows a connection notice and retains publisher excerpts when summarization fails.

For an existing OpenAI-compatible LiteLLM proxy, set `LITELLM_BASE_URL` (including `/v1`), `LITELLM_MODEL`, and `LITELLM_API_KEY` directly in `.env`, then restart the app. There is no automatic fallback to a separately billed OpenAI API.

## Phone access

For a phone on the same trusted Wi-Fi, run:

```sh
SIGNAL_HOST=0.0.0.0 ./run.sh
```

Open `http://<your-laptop-LAN-IP>:8080` on your phone and enter `APP_PASSWORD` from `.env`. Bookmarks and preferences are shared through SQLite. The laptop and server must be running and awake. Local HTTP is intended for trusted Wi-Fi only. For access away from home, use a private VPN such as Tailscale or deploy behind HTTPS with authentication; remote hosting is not configured by this project. Do not port-forward the local HTTP server to the public internet.

## Collection and personalization

- Ten official RSS/Atom endpoints: OpenAI, Hugging Face, Google Research, NVIDIA, LangChain releases, Oracle AI, Oracle Cloud, PyTorch releases, vLLM releases, and Transformers releases.
- Concurrent collection on startup, on demand, and every 24 hours by default. Configure 1–168 hours in **Tune your signal**. While the server is off or asleep there is no collection; it catches up when running again.
- Up to 35 entries per source, limited to the past 30 days when dates exist. Missing dates are labeled unavailable and use collection time for filtering. The default screen covers seven days.
- URL normalization removes tracking parameters and deduplicates matching source URLs. Related coverage across different URLs is not merged.
- Keyword classification and ranking are deterministic heuristics, not LLM relevance scores. Preferences filter topics before ingestion and in the briefing. The reading list remains accessible across topic changes.
- Up to 8 previously unsummarized articles per refresh by default (configurable 1–30). This limits calls per refresh, not per calendar day. Only articles from the last seven days are summarized. One proxy failure stops that refresh's model calls.
- AI sees titles and publisher feed excerpts, not full linked articles. Briefs, relevance explanations, and suggested next steps are grounded in that excerpt; original pages provide complete details. Treat summaries as a reading aid.
- Source failures are visible under **Sources** and retried next collection. A source can change its RSS endpoint; edit `SOURCES` in `app/main.py` if needed. This is feed monitoring, not exhaustive live web search.

## Development

```sh
.venv/bin/python -m unittest discover -s tests -v
```

Tests use a temporary SQLite database and mocked HTTP for feed freshness, deduplication, retained bookmarks, summary payloads, authentication, cross-origin mutation protection, and settings validation. Live network and model integration need a separate run with your login. `requirements.txt` pins the application dependencies. The optional proxy is isolated in `.proxy-venv`; record the working proxy version after login with `.proxy-venv/bin/python -m pip freeze > proxy-requirements.lock` if you want to reproduce it.

Single-user, single-process application. Use one Uvicorn process to avoid duplicate scheduled work. Password auth uses an HttpOnly SameSite cookie; HTTPS connections receive Secure cookies. Credentials never reach the browser UI. Data stays in ignored `data/signal.db`. Back up that file while the server is stopped. Delete `.venv` and `.proxy-venv` to remove installed dependencies; global packages are untouched.
