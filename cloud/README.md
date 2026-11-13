# AI BookMarks hosted edition

This edition serves the dark RSS reader on Cloudflare Workers with a persistent D1 news database. A daily GitHub Actions job runs the existing Python collector at approximately 07:00 Asia/Kolkata and publishes source-grounded RSS entries. Neither the app nor collection requires an awake laptop or a model API.

## Public reader behavior

News is shared and read-only. Topics, enabled feeds, bookmarks and read state belong to each visitor's browser (`localStorage`). Different browsers/devices do not sync personal state; no account is required. Saving snapshots keeps a saved article available when it leaves the latest-news response. Clearing browser data clears personal preferences and bookmarks. No local bookmarks, read state, profile, or API keys are uploaded by the initial seeding operation.

The server retains collected news in D1 and serves the latest 5,000 rows per response. Publisher excerpts are shown, not AI-generated summaries. Some feeds publish titles only. Responses are cached for up to five minutes. **Sync latest feed** loads the current published feed; public visitors cannot trigger cloud collection or change other readers' settings.

## Deployment

Cloud dependencies live in `cloud/node_modules`, separate from `.venv` and global packages. With Node.js 22+ and pnpm installed:

```sh
cd cloud
pnpm install
cd ..
.venv/bin/python cloud/scripts/export_catalog.py
node cloud/scripts/build.mjs
python3 cloud/manage.py login --scopes account:read user:read workers:write workers_scripts:write d1:write
python3 cloud/manage.py d1 create ai-bookmarks-rss --binding DB --update-config
```

Review the D1 binding in `cloud/wrangler.jsonc`. Replace the local-preview-only database ID with the ID Cloudflare actually returns; never deploy the placeholder. If a database already exists, reuse its returned ID instead of creating another one.

Create a strong random `INGEST_TOKEN` and put it in the Worker's secret store using `python3 cloud/manage.py secret put INGEST_TOKEN`. Keep a local ignored copy if needed; never commit secrets. Apply schema and publish:

```sh
python3 cloud/manage.py d1 migrations apply DB --remote
python3 cloud/manage.py deploy
```

Set the GitHub repository variable `SITE_URL` to the returned HTTPS origin and the repository secret `INGEST_TOKEN` to the same ingestion token. The workflow is skipped until `SITE_URL` exists. Run **Daily RSS collection → Run workflow** once and check that it succeeds. Verify the hosted Sources screen and collection timestamp afterwards. Set repository Actions billing limits so the daily task cannot cause spending beyond the included allowance if that allowance is shared with other projects.

For initial history seeding, set `SITE_URL` and `INGEST_TOKEN` in the environment (or ignored `cloud/.dev.vars`) and run `.venv/bin/python cloud/scripts/collect.py --seed-existing`. This exports only public news fields from the existing local database. A successful publication is verified through an authenticated metadata readback.

## Free-tier behavior

Use the Cloudflare Workers Free plan and D1 Free allowance. GitHub's included Actions compute allowance is shared with other jobs. Free limits, provider terms, and availability can change. The app has no model costs; don't enable paid plans or unbounded paid Actions usage if a strict zero budget is required.

Scheduled GitHub jobs can be delayed, and failed collection is visible in the Actions run. A failed source does not remove old articles; a job with no successful sources does not replace the last published collection metadata. Public data reads do not need the ingestion token. The authenticated ingestion endpoint accepts only bounded batches, known sources/topics, safe URLs and parameterized SQL statements.

## Verify locally

```sh
node --test cloud/tests/worker.test.mjs
python3 cloud/manage.py d1 migrations apply DB --local
python3 cloud/manage.py dev --port 8787
```

A local `.dev.vars` supplies `INGEST_TOKEN` and `SITE_URL=http://127.0.0.1:8787` for local testing. OAuth state, local database state, deployment secrets, generated assets and `node_modules` are ignored in Git. Deployment tooling keeps its config inside `cloud/.cloudflare` and logs inside `cloud/.wrangler`, rather than changing global package installations.
