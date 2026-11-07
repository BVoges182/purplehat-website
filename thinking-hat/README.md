# Thinking Hat

Client dashboard for Purple Hat. Approved people register with an invite key, then sign in to see figures, invoices, a business photo, and build requests.

## Run

From this folder, in PowerShell:

```
npm.cmd run install:all
.\start.ps1
```

`npm.cmd run dev` does the same thing as `start.ps1`. Use `npm.cmd` if PowerShell blocks `npm`.

- App: http://localhost:5173/login
- API: http://localhost:8787

The Purple Hat landing page button “Thinking Hat Login” opens the app login.

The admin email and password are in `server/.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`). The password is applied to that admin account when the server starts. Change it in `.env` before you share the machine.

## Deploy on Hostinger

Use a Business or Cloud plan. In hPanel: **Websites → Add Website → Node.js web app → Import Git repository**. Choose this repo and branch `main`.

| Setting | Value |
| --- | --- |
| Root directory | `/` (the folder that contains `index.html` and `thinking-hat`) |
| Node.js version | 24 |
| Framework | Express |
| Entry file | `thinking-hat/server/src/index.js` |
| Output directory | leave empty |

Add these environment variables in hPanel. Do not commit `server/.env`.

- `JWT_SECRET` — long random string
- `ADMIN_EMAIL` — `admin@purplehat.fun`
- `ADMIN_PASSWORD` — the live admin password
- `DATA_DIR` — optional. Example: `/home/YOURUSER/thinking-hat-data`. It must sit outside `hbuilds` and `public_html`.
- `BASIC_AUTH_USER` — Trader login name. Default `purplehat`.
- `BASIC_AUTH_PASSWORD` — Trader password, at least 12 characters. Set it only in hPanel. If it is missing, `/trader` returns 503 and the accounting homepage stays open.

Hostinger sets `PORT`. Express hides the build command, so `npm install` builds Thinking Hat and installs the pinned Trader package. The intended database folder is `DATA_DIR`, or `thinking-hat-data` in the home directory when the app path contains `hbuilds`. That is outside the deploy tree. Hostinger documents that `hbuilds` and `public_html` are replaced on every deploy, and it does not document a supported local disk for SQLite. Survival across a restart is plausible. Survival across a redeploy is not verified. See `docs/trader-integration.md`.

The brochure and Thinking Hat are the same site. `/` is the brochure. `/login` is Thinking Hat. `/trader` is the pinned trading app. Pushing to `main` redeploys. Do not merge or deploy the Trader integration branch until the storage check in that document has passed.

## Invite keys

1. Sign in as admin.
2. Open Invite keys and create a key.
3. Copy the key. It is shown once. Email it to the client.
4. They open Register, enter the key, and create an account.

“Approve access when they register” lets them sign in immediately. Leave it off if you want to approve the person after they register. You can also suspend access, edit details, and change a person between client and admin.

## Figures

New clients start with sample figures so the dashboard is not empty. Replace them on the person’s admin page. The client dashboard reads those figures from Thinking Hat and refreshes every few seconds. Xero and QuickBooks stay the system of record. This app does not connect to them, and it does not take card payments.

Uploads are limited to JPG, PNG, or WebP under 2 MB.
