# Mount Purple Hat Trading at /trader

This is preparation only. It does not deploy the app, change DNS, or change the Hostinger project for purplehat.fun.

The live accounting website at `purplehat.fun/` is connected to `purplehat-website`, not to `BVoges182/purplehat-trading`. Leave that connection as it is. The accounting site source is not in this repository, so end-to-end integration with the live site is unverified.

Trader stays a separate project. A shared-server release has to assemble the existing website and this package into one deployment. Do not upload a Trader-only archive as the website.

## What runs

Production command:

```bash
npm ci --omit=dev
npm start
```

`npm start` runs `node server/src/serve.js`. That process listens on `process.env.PORT` (default `8792`) and `process.env.HOST` (default `0.0.0.0`). It serves the built UI at `/trader` and `/trader/`, and the API at `/trader/api`. It does not use the Vite development server.

`npm run dev` is unchanged. It runs the API at `/api` on port `8792` and Vite at `http://localhost:5176`. Local routes stay `/trading/BTC`, `/scanner`, `/backtest`, `/playbooks`, and `/settings`.

The production page routes are the same paths under `/trader`, for example `/trader/trading/BTC`. Refreshing a nested route returns the Trader page. `/trader/api/...` that does not exist returns JSON `404`, not HTML.

`server/src/index.js` is the development API entry and exports `boot()`. `server/src/serve.js` is the production entry. `mountTrader()` in `server/src/app.js` attaches only the `/trader` router to a parent Node server.

## Example adapter

`docs/examples/mount-trader.mjs` is an example for a Node HTTP server. It is not wired to purplehat.fun. It forwards `/trader` to Trader and leaves `/` and the parent site's own `/api` alone. Use it only if the existing server is Node and you can edit its entry file. If that entry file is not Node, run `npm start` beside the site and reverse-proxy `/trader` to this process. Do not guess the accounting site's framework.

## Build the package

From this repository, with the lockfile:

```bash
npm ci
npm run package:trader
```

That builds the client with the `/trader/` asset base and writes:

- `release/purplehat-trader/`
- `release/purplehat-trader.tar.gz`

The package contains `package.json`, `package-lock.json`, `.env.example`, `dist/`, `server/` (without tests), `shared/`, and this document. It does not contain `.env`, sqlite files, `node_modules`, or the accounting website.

On the host that will run Trader:

```bash
npm ci --omit=dev
copy .env.example .env
npm start
```

Put real secrets only in the host `.env`. Do not commit that file.

## Combined release

Include the current accounting site exactly as it is deployed today, plus this Trader package mounted at `/trader`. Trader must not own `/`, the site's existing pages, its assets, or its APIs. A request that is not under `/trader` has to reach the existing site.

Hostinger account settings were not changed by this preparation. The confirmed connection is `purplehat.fun` to `purplehat-website`.

## Rollback

Trading repo checkpoint on `main`: `b0e96af2573dcaa3cbd819b970c70cc9d2320857`.

Preparation after that commit is on `work/trader-deployment` and is not merged to `main`. To drop the preparation and return the trading repo to the checkpoint, check out that SHA. To undo a bad combined upload, restore the accounting site from `purplehat-website`. Do not restore it by publishing this repository as the site root.

## Persistence and restarts

The database is the sqlite file at `DATABASE_URL` (`server/data/trading.sqlite` unless you set another path). It stores candles, evaluation cursors, simulated trades, settings, and alert delivery rows. The file has to live on a disk that survives a restart. A host that wipes the filesystem on sleep or redeploy starts from an empty cache.

While a Trader page is open, the browser refreshes after the next 4H or daily close and asks the server to scan. That timer stops when the tab is closed or the computer sleeps. `npm start` also catches up when the process starts: it fetches missing closed candles, then walks evaluation cursors in time order. Signal rows use a stable id and `INSERT ... ON CONFLICT DO NOTHING`. A closed bar already recorded in `evaluations` is not alerted again. Simulated trades use a stable id and are updated in place. Successful alert deliveries are not sent again.

Close-aligned timers inside the process stop when the process stops. This package does not add a paid always-on worker. `npm run worker` and the optional `ALERTS_CRON_ENABLED` loop are separate and are not required for the open-page refresh. Do not rely on an in-process timer to keep running while the host is asleep.

Leave `TRADER_WARMUP` unset. `TRADER_WARMUP=0` skips the startup catch-up and is only for a local route check.

## Authentication and public API

`BASIC_AUTH_PASSWORD` empty disables the login gate. Health at `/trader/api/health` and `/healthz` stays public either way. With a password set, the other Trader routes require HTTP Basic. The user defaults to `purplehat`.

`POST /trader/api/jobs/evaluate` also requires `x-eval-secret` to match `EVAL_JOB_SECRET`. Alerts stay off unless `ALERTS_ENABLED=true` and a channel secret is set. Tokens are redacted from stored errors. There is no exchange trading key.

Unresolved: there is no IP rate limit. A public refresh or scanner call can request market data from Binance, OKX, and Bybit. Set `BASIC_AUTH_PASSWORD` before anyone on the internet can reach `/trader`. An empty password leaves those routes open and can run up provider rate limits. This was not given a new limiter in this preparation.

Fly.io is a manual `fly deploy` path in `docs/deploy.md`. `purplehat-trading.fly.dev` was not online when this was prepared. That file is not an automatic deploy of purplehat.fun.
