# Trader on the Purple Hat website

This branch, `work/trader-integration-current`, prepares a combined release on top of current website `main`. It does not deploy it, change Hostinger, or merge into `main`.

`purplehat.fun` stays connected to `purplehat-website`. Do not point it at `BVoges182/purplehat-trading`.

The parent of this branch is website `origin/main` at `77a29b7e9b89a39dbc51f5ebad1ea6810029014a`. That history includes the live homepage, accounting, authentication, invite email, contact form, and Drive insights. The integration commit is the tip of this branch. The reference branch `work/trader-integration` remains `98078e432bb6f344667f0a432cb4fa4920ed83a3` and is not the deploy source.

## What is pinned

Trader source of truth: `https://github.com/BVoges182/purplehat-trading.git`

Commit: `603b207ffa18cc151701bd79659967bff9779584` on `work/trader-deployment`.

The snapshot lives in `vendor/purplehat-trader`. Do not edit it. `trader.pin.json` records the commit and file hashes. The website mounts `mountTrader()` from that package because the production entry is Express:

`thinking-hat/server/src/index.js`

Hostinger’s entry file stays `thinking-hat/server/src/index.js`. Its `lsnode.js` loads that file with `require()`, so the module graph has no top-level await.

The UI is `/trader`. The API is `/trader/api`. The accounting homepage, its pages, and its `/api` routes stay on the website.

Trading `main` remains `b0e96af2573dcaa3cbd819b970c70cc9d2320857`. Do not merge `work/trader-deployment` into trading `main`.

Website rollback for this branch is current `origin/main`, `77a29b7e9b89a39dbc51f5ebad1ea6810029014a`. Returning the live site to `eb946b9af71371aac7efafd9aae46114f670a8e0` would drop the 50 commits that are already on `main`.

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

`trust proxy` is `1`. Hostinger’s generated `.htaccess` is one reverse-proxy hop, so the client address is the address that hop records. A direct connection to the Node port could still spoof `X-Forwarded-For`. Keep Node reachable only through that proxy. It is unverified whether Hostinger overwrites `X-Forwarded-For`.

`TRADER_WARMUP=0` skips the startup candle catch-up. Staging refuses to start unless that value is exactly `0`. Leave it unset on production only after storage is verified. The catch-up stops when the process stops. `ALERTS_CRON_ENABLED` is not started by this mount. Alerts stay off unless `ALERTS_ENABLED` and the channel secrets are set on the host.

## SQLite

| File | Location |
| --- | --- |
| Accounting | `{storage}/data/thinking-hat.sqlite` |
| Trader | `{storage}/data/trader.sqlite` |

`storage` is `DATA_DIR` when that variable is set. On a Hostinger build with `DATA_DIR` unset, and with `PURPLEHAT_STAGING` unset, the code detects `hbuilds` in the server path and uses `thinking-hat-data` under the account home. Locally, with neither of those, it uses `thinking-hat/server`, which is inside the project tree.

`PURPLEHAT_STAGING=1` changes that rule. Staging throws before it creates or opens a database unless all of these are true:

- `DATA_DIR` is set and absolute.
- That path is not the live data directory, not inside it, and does not contain it. The live directory is `thinking-hat-data` under the account home.
- No path segment is `hbuilds` or `public_html`.
- `TRADER_WARMUP` is exactly `0`.

The account home itself is refused, because it contains the live data directory. A new sibling folder is accepted.

### How to read the account home

File Manager opens in `domains/<domain>`. Click the house icon. The path bar then shows the account home. Create a new folder there for staging and copy that folder’s full path into `DATA_DIR`.

When SSH is enabled for the staging site, `printenv HOME` prints the same account home. Append a new folder name. Copy the path the tool prints. A guessed `/home/...` path is not a substitute.

Saving environment variables in hPanel redeploys that website. Set the staging variables on the staging website before its first boot.

The Trader file holds candles, evaluation cursors, simulated trades, settings, and alert-delivery rows. It is separate from the accounting file. The website mount ignores `DATABASE_URL` and always uses `{storage}/data/trader.sqlite`. Stop the Node app, then take a consistent copy with `node scripts/backup-sqlite.mjs`, passing the sqlite path inside the staging `DATA_DIR` and a backup path outside `hbuilds` and `public_html`.

Restore by stopping the app, replacing `trader.sqlite` with that copy, deleting any leftover `trader.sqlite-wal` and `trader.sqlite-shm`, and starting the app again. Back up `thinking-hat.sqlite` with the same command. Run that command only against the staging directory.

### Blocker

Hostinger’s file-structure documentation says files in `hbuilds/` and `public_html/` are overwritten on every deployment. Manual edits there are not supported. The database products in the Node.js wizard are Supabase and MongoDB Atlas. There is no documented Hostinger volume for local SQLite.

`thinking-hat-data` under the account home is outside those two trees, so a process restart on the same machine should keep it. That has not been checked on this account. A redeploy, plan move, or home-directory cleanup could still delete it. Until a marker file in the chosen `DATA_DIR` is shown to survive both a restart and a redeploy, do not call this deployment ready.

`seedAdmin` updates the admin row in whichever SQLite file the process opens. A staging `DATA_DIR` that points at the live folder would apply the staging `ADMIN_PASSWORD` there. The staging guard refuses that path before it opens the file.

## Local checks

From the website repository:

```bash
node scripts/install-trader.mjs
npm test
npm run test:combined
npm run assemble:combined
```

`test:combined` sets `PURPLEHAT_STAGING=1`, `TRADER_WARMUP=0`, and a temporary `DATA_DIR`. It uses fresh random secrets and blanks inherited mail and Drive variables for the child process. It does not open `thinking-hat-data` under the account home. The combined release is written to `release/purplehat-combined/` and is not committed.

## Staging plan

Do this only after review. Nothing below has been done. Use a staging website. Leave `purplehat.fun` on `main`.

1. Confirm the live hPanel app still deploys `purplehat-website`, branch `main`, entry `thinking-hat/server/src/index.js`, Node 24, root `/`.
2. Create the staging Node app separately. Its first boot must have `PURPLEHAT_STAGING=1`.
3. Read the account home from that staging site’s File Manager path bar, or from `printenv HOME`. Create a new folder and set `DATA_DIR` to that absolute path.
4. Set fresh values, generated for staging: `JWT_SECRET` (at least 16 characters), `ADMIN_PASSWORD` (at least 8), a staging-only `ADMIN_EMAIL`, and `BASIC_AUTH_PASSWORD` (at least 12). Set `TRADER_WARMUP=0`. Set `APP_URL` to the staging site URL.
5. Leave these unset on staging: `DATABASE_URL`, `EMAIL_API_KEY`, `SMTP_PASSWORD`, `SMTP_PASS`, `GOOGLE_DRIVE_API_KEY`, `GOOGLE_API_KEY`, `EVAL_JOB_SECRET`, `ALERTS_ENABLED`, `ALERTS_CRON_ENABLED`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ALERT_EMAIL_TO`, and `ALERT_EMAIL_FROM`. Do not copy live secrets or live sqlite files.
6. Point the staging app at `work/trader-integration-current` only after this branch has been reviewed and pushed, and only after confirming a non-`main` branch does not deploy the live site. This branch is local until that review.
7. After boot, the log line `Data directory:` must be the new folder. A line that names `thinking-hat-data` means staging opened the live directory: stop that app.
8. Write a marker file in the staging `DATA_DIR`. Restart the app from the Running control, without rebuilding. Confirm the marker and both sqlite files are still there.
9. Redeploy the same commit. Confirm the marker and both sqlite files are still there. If they are gone, stop. The storage blocker is confirmed and Trader must not go live on this host.
10. Check `/` (no Basic prompt), `/about`, `/contact`, `/privacy`, `/terms`, `/disclaimer`, `/api/health`, `/logo.png`, `/integrations.html`, `/login`, `/trader/` (Basic prompt), a refresh of `/trader/trading/BTC`, `/trader/api/health`, `/trader/api/coins` with and without the password, and an unknown `/trader/api/...` path (JSON 404 once signed in).
11. Confirm a second refresh or scanner request while one scan is running returns 429.
12. Keep `TRADER_WARMUP=0` on staging. Production catch-up stays off until the storage check passes and you choose to enable it on the live app.

## Rollback

1. Leave the live Hostinger app on `purplehat-website` branch `main`. The current `main` commit is `77a29b7e9b89a39dbc51f5ebad1ea6810029014a`. Do not point it at `eb946b9af71371aac7efafd9aae46114f670a8e0`. Do not merge this branch.
2. Stop the staging app, or remove `PURPLEHAT_STAGING`, `DATA_DIR`, and `BASIC_AUTH_PASSWORD` from the staging app only. Saving environment variables redeploys that website.
3. Leave trading `main` at `b0e96af2573dcaa3cbd819b970c70cc9d2320857`. Do not promote `603b207`.
4. The accounting sqlite is not part of git. Keep any staging backup separate from the live `thinking-hat-data` folder. Restoring website `main` does not delete that live folder, and it also does not prove a home-directory file survived a deploy.

## Proposed deployment steps

These are the steps to run later. They were not run.

1. Finish the staging plan, including a restart and a redeploy that both keep the sqlite files.
2. Push `work/trader-integration-current` only after review, and only after confirming the live app builds `main` alone.
3. Merge into `purplehat-website` `main` only when you explicitly approve it.
4. Let Hostinger build `main`: `npm install` runs the client build and `npm ci --omit=dev` inside `vendor/purplehat-trader`.
5. Keep `DATA_DIR`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `APP_URL`, the mail variables, the Drive key, and `BASIC_AUTH_PASSWORD` in hPanel for the site that needs them. Do not put them in git. Leave `PURPLEHAT_STAGING` unset on the live site so the existing home-directory fallback remains available there.
6. After the build is Running, repeat the route checks on `https://purplehat.fun` and confirm `/` is still the accounting homepage.
