# Trader on the Purple Hat website

This branch prepares a combined release. It does not deploy it, change Hostinger, or merge into `main`.

`purplehat.fun` stays connected to `purplehat-website`. Do not point it at `BVoges182/purplehat-trading`.

## What is pinned

Trader source of truth: `https://github.com/BVoges182/purplehat-trading.git`

Commit: `603b207ffa18cc151701bd79659967bff9779584` on `work/trader-deployment`.

The snapshot lives in `vendor/purplehat-trader`. Do not edit it. `trader.pin.json` records the commit and file hashes. The website mounts `mountTrader()` from that package because the production entry is Express:

`thinking-hat/server/src/index.js`

The UI is `/trader`. The API is `/trader/api`. The accounting homepage, its pages, and its `/api` routes stay on the website.

Trading `main` rollback remains `b0e96af2573dcaa3cbd819b970c70cc9d2320857`. Do not merge `work/trader-deployment` into trading `main`.

Website `main` rollback remains `eb946b9af71371aac7efafd9aae46114f670a8e0`.

## Password

Set `BASIC_AUTH_PASSWORD` only in the host environment. It must be at least 12 characters. `BASIC_AUTH_USER` defaults to `purplehat`.

If the password is missing or shorter, every `/trader` URL returns JSON 503 and does not send `WWW-Authenticate`. The accounting homepage and the existing `/api` routes still start. The pinned router would otherwise treat an empty password as “no login”. This mount does not allow that.

With a valid password, Trader pages and `/trader/api` data routes require HTTP Basic. `/trader/api/health` and `/trader/healthz` stay public, which is the pinned router’s behavior. The homepage never asks for that password.

Do not commit the password and do not print it in logs.

## Limits and proxy

These limits are in the website mount, in front of the pinned package. One Node process enforces them. A second process would not share the lock.

- `/trader/api` except health: 30 requests per minute per client IP.
- Other `/trader` pages and assets: 120 requests per minute per client IP.
- `GET /trader/api/candles/refresh`: 6 requests per 10 minutes per client IP, and only one symbol. A missing symbol, a list, or two `symbol` values returns 400 and does not scan every coin.
- Refresh, `GET /trader/api/scanner`, `POST /trader/api/settings/re-evaluate`, and `POST /trader/api/jobs/evaluate` share one in-process scan. A second scan receives 429 and `Retry-After: 5`.

`trust proxy` is `1`. Hostinger’s generated `.htaccess` is one reverse-proxy hop, so the client address is the address that hop records. A direct connection to the Node port could still spoof `X-Forwarded-For`. Keep Node reachable only through that proxy.

`TRADER_WARMUP=0` skips the startup candle catch-up. Leave it unset only after storage is verified. The catch-up stops when the process stops. `ALERTS_CRON_ENABLED` is not started by this mount. Alerts stay off unless `ALERTS_ENABLED` and the channel secrets are set on the host.

## SQLite

| File | Location |
| --- | --- |
| Accounting | `{storage}/data/thinking-hat.sqlite` |
| Trader | `{storage}/data/trader.sqlite` |

`storage` is `DATA_DIR` when that variable is set. On a Hostinger build, the code detects `hbuilds` in the server path and otherwise uses `~/thinking-hat-data`. Locally, with neither of those, it uses `thinking-hat/server`, which is inside the project tree. Set `DATA_DIR` on the host.

The Trader file holds candles, evaluation cursors, simulated trades, settings, and alert-delivery rows. It is separate from the accounting file. Stop the Node app, then take a consistent copy:

```bash
node scripts/backup-sqlite.mjs /home/YOURUSER/thinking-hat-data/data/trader.sqlite /home/YOURUSER/trader-backup.sqlite
```

Restore by stopping the app, replacing `trader.sqlite` with that copy, deleting any leftover `trader.sqlite-wal` and `trader.sqlite-shm`, and starting the app again. Back up `thinking-hat.sqlite` with the same command.

### Blocker

Hostinger’s file-structure documentation says files in `hbuilds/` and `public_html/` are overwritten on every deployment. Manual edits there are not supported. The database products in the Node.js wizard are Supabase and MongoDB Atlas. There is no documented Hostinger volume for local SQLite.

`~/thinking-hat-data` is outside those two trees, so a process restart on the same machine should keep it. That has not been checked on this account. A redeploy, plan move, or home-directory cleanup could still delete it. Until a marker file in that directory is shown to survive both a restart and a redeploy, do not call this deployment ready.

## Local checks

From the website repository:

```bash
node scripts/install-trader.mjs
npm run test:combined
npm run assemble:combined
```

`test:combined` uses a temporary `DATA_DIR`. It does not open the live accounting database. The combined release is written to `release/purplehat-combined/` and is not committed.

## Staging plan

Do this only after you accept the storage risk or verify it. Nothing below has been done.

1. Confirm hPanel still deploys `purplehat-website`, branch `main`, entry `thinking-hat/server/src/index.js`, Node 24, root `/`.
2. Back up the current home data directory if it already exists.
3. Prefer a staging site or staging hostname. Do not replace `purplehat.fun` on the first boot.
4. Set the existing `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` as they are now. Add `DATA_DIR` outside `hbuilds` and `public_html`, for example `/home/YOURUSER/thinking-hat-data`. Add `BASIC_AUTH_PASSWORD` in hPanel only. Set `TRADER_WARMUP=0` for the first boot. Leave alert secrets unset.
5. Point that staging app at `work/trader-integration` only if you have confirmed a non-`main` branch does not deploy the live site. This branch was not pushed.
6. Write a marker file in `DATA_DIR`. Restart the app from the Running control, without rebuilding. Confirm the marker and both sqlite files are still there.
7. Redeploy the same commit. Confirm the marker and both sqlite files are still there. If they are gone, stop. The storage blocker is confirmed and Trader must not go live on this host.
8. Check `/` (no Basic prompt), `/api/health`, `/logo.png`, `/integrations.html`, `/trader/` (Basic prompt), a refresh of `/trader/trading/BTC`, `/trader/api/health`, `/trader/api/coins` with and without the password, and an unknown `/trader/api/...` path (JSON 404 once signed in).
9. Confirm a second refresh or scanner request while one scan is running returns 429.
10. Unset `TRADER_WARMUP` only after the storage check passes and you want startup catch-up.

## Rollback

1. Point the Hostinger app back at `purplehat-website` branch `main`, commit `eb946b9af71371aac7efafd9aae46114f670a8e0`. Redeploy that. Do not merge `work/trader-integration`.
2. Leave trading `main` at `b0e96af2573dcaa3cbd819b970c70cc9d2320857`. Do not promote `603b207`.
3. The accounting sqlite in the home data directory is not part of git. Keep the backup taken before staging. Restoring `main` does not delete that file by itself, and it also does not prove the file survived the staging deploy.
4. Remove `BASIC_AUTH_PASSWORD` from the live app’s environment when Trader is no longer routed. Saving environment variables on Hostinger redeploys the app.

## Proposed deployment steps

These are the steps to run later. They were not run.

1. Finish the staging plan, including a restart and a redeploy that both keep the sqlite files.
2. Push `work/trader-integration` only after confirming the live app builds `main` alone.
3. Merge into `purplehat-website` `main` only when you explicitly approve it.
4. Let Hostinger build `main`: `npm install` runs the client build and `npm ci --omit=dev` inside `vendor/purplehat-trader`.
5. Keep `DATA_DIR`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `BASIC_AUTH_PASSWORD` in hPanel. Do not put them in git.
6. After the build is Running, repeat the route checks on `https://purplehat.fun` and confirm `/` is still the accounting homepage.
