# AI BookMarks hosted edition

[Live reader](https://ai-bookmarks-rss.ai-bookmarks-cloud.workers.dev/) · [Component and cost overview](../docs/AI-BookMarks-Overview.md)

Cloudflare Workers serves the dark, responsive reader. GitHub Actions collects RSS around 07:00 IST and commits public JSON snapshots under `feed/`, using only the built-in GITHUB_TOKEN. No deployment secret is required for daily RSS collection. The first workflow run succeeded. Bookmarks, read state and preferences remain in each visitor's browser; they do not sync between devices.

## Build and deploy

Python packages belong in the root `.venv`; Node packages belong in `cloud/node_modules`. With Node 22+ and pnpm available:

```sh
pnpm --dir cloud install --frozen-lockfile
.venv/bin/python cloud/scripts/export_catalog.py
node cloud/scripts/build.mjs
python3 cloud/manage.py login --scopes account:read user:read workers:write workers_scripts:write d1:write
python3 cloud/manage.py d1 migrations apply DB --remote
python3 cloud/manage.py deploy
```

Reuse the existing D1 binding in `wrangler.jsonc`. For a new account, create a database and replace both account/database IDs with the actual returned values before deploying. `manage.py` keeps Wrangler configuration and logs project-local. Generated frontend assets are ignored; rebuild them before deployment. Deployment is manual; daily RSS publication does not redeploy the Worker.

`cloud/src/index.js` reads public snapshots from `varanasi0403/ai-bookmarks`. If forking, change this repository constant. Initial news remains in D1 as a fallback for non-successful upstream responses. Caches may delay updated feed visibility by about five minutes.

## Optional summaries

Create a Groq Free-plan key, then store it using `python3 cloud/manage.py secret put GROQ_API_KEY`. Never commit a key. The optional **AI summary** button uses open-weight `openai/gpt-oss-20b`, based only on the title and at most 1,500 characters of the publisher excerpt; it does not read the full article. RSS works without the key. The key is never sent to visitors.

D1 caches successful summaries and atomically limits the site to 20 new model calls per UTC day. Concurrent requests share pending/cache state. Failed calls count toward the limit. Free-provider failures show a retry message and leave excerpts available. There is no paid fallback. A public visitor can consume the shared daily allowance; cached summaries remain available.

## Collector and checks

```sh
.venv/bin/python cloud/scripts/publish_feed.py
node --test cloud/tests/worker.test.mjs
.venv/bin/python -m unittest discover -s tests -q
```

The collector starts from the previous snapshot and adds new news. No successful sources means no publication. The active snapshot retains up to 5,000 entries; per-item files support summary lookup for older articles. Original publisher URLs remain available. In GitHub, use **Daily RSS collection → Run workflow** to collect manually; **Sync latest feed** in the reader only reloads published data.

Keep Cloudflare and Groq on Free plans. Standard Actions runners are free for this public repository. Quotas can stop service; paid account upgrades can incur charges. See the linked overview for official pricing references and operating limits.
