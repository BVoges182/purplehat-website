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

The Purple Hat landing page button “Client login” opens the app login.

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

- `JWT_SECRET` — long random string, at least 16 characters
- `ADMIN_EMAIL` — `admin@purplehat.fun` on the live site
- `ADMIN_PASSWORD` — at least 8 characters
- `DATA_DIR` — optional on the live site. When the app runs from a Hostinger build and this is unset, the database and photos go in `thinking-hat-data` under the account home.
- `APP_URL` — `https://purplehat.fun` on the live site
- `EMAIL_API_KEY` — Resend API key
- `EMAIL_FROM` — `info@purplehat.fun`
- `EMAIL_FROM_NAME` — `Purple Hat`
- `GOOGLE_DRIVE_API_KEY` or `GOOGLE_API_KEY` — optional. Reads a Drive file shared as “anyone with the link”.

Invite email uses the Hostinger mailbox when `SMTP_PASSWORD` is set (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASSWORD`). Otherwise it uses Resend with `EMAIL_API_KEY`. Names and example values are in `server/.env.example`. The DNS records for Resend are listed under Invite email below.

Hostinger sets `PORT`. Express hides the build command, so `npm install` builds Thinking Hat itself and installs the pinned Trader package. The database and photos are stored in `DATA_DIR` when that variable is set. On a Hostinger build with `DATA_DIR` unset, they are stored in `thinking-hat-data` under the account home, outside `hbuilds` and `public_html`. Survival of that home folder across a redeploy has not been verified on this account.

A staging website on the same Hostinger account uses the same account home. Before the first staging boot, set `PURPLEHAT_STAGING=1`. Staging then starts only when `DATA_DIR` is an absolute path of a new folder, `TRADER_WARMUP` is `0`, and that folder is outside the live `thinking-hat-data` directory, `hbuilds`, and `public_html`. Obtain the account home from the staging site’s File Manager: click the house icon and read the path bar. With SSH, `printenv HOME` prints the same directory. Create a new folder and copy its full path into `DATA_DIR`. Use new values for `JWT_SECRET`, `ADMIN_PASSWORD`, `ADMIN_EMAIL`, and `BASIC_AUTH_PASSWORD`. Leave the live mail and Drive secrets unset on staging. Saving environment variables in hPanel redeploys that website.

Trader is served at `/trader` when `BASIC_AUTH_PASSWORD` is at least 12 characters. The accounting homepage does not ask for that password. See `docs/trader-integration.md`. The accounting routes, invite email, and Drive insights stay in place.

The brochure and Thinking Hat are the same site. `/` is the brochure. `/login` is Thinking Hat. Pushing to `main` redeploys.

## Invite keys

1. Sign in as admin.
2. Open Invite keys. Say who the key is for, choose a template, and enter the client's email.
3. Tick Send email key and press Send email key. The key is saved even if the email cannot be sent. Copy the key or the invite link from the screen.
4. The client opens the link, or opens Register and enters the key, then signs in.

Invite status on the person and on the key is Pending, Sent, Accepted, or Expired. Resend invite sends a new key and retires the previous one. A second send is refused while an invite for that address is still open.

If the email variables are missing, the admin pages show a setup warning.

## Invite email

The live site sends through the provider that is already configured.

- Hostinger mailbox, when `SMTP_PASSWORD` is set. `SMTP_HOST` is `smtp.hostinger.com` and `SMTP_PORT` is `465`. `SMTP_USER` is `info@purplehat.fun`. This is the mailbox password, not `ADMIN_PASSWORD`. No extra DNS is required. purplehat.fun already has Hostinger mail: MX `mx1.hostinger.com` and `mx2.hostinger.com`, SPF `v=spf1 include:_spf.mail.hostinger.com ~all`, and DMARC `v=DMARC1; p=none`. Do not replace those records.
- Resend, when the mailbox password is not set and `EMAIL_API_KEY` is set. `EMAIL_FROM` is `info@purplehat.fun` and `EMAIL_FROM_NAME` is `Purple Hat`.

`APP_URL` should be `https://purplehat.fun` so the invite link in the email points at the live site.

### DNS records to add for Resend

Add the domain `purplehat.fun` in Resend, then copy the records from that domain's Records tab. Resend generates the exact values. Do not change the Hostinger MX records on `@`, and do not replace the existing SPF or DMARC records on `@`.

For a domain added before August 2026, Resend usually asks for these on the `send` host:

| Type | Hostinger name | Value |
| --- | --- | --- |
| MX | `send` | `10 feedback-smtp.<region>.amazonses.com` |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` |
| TXT | `resend._domainkey` | the DKIM value from Resend |

`<region>` is the region shown by Resend, such as `us-east-1` or `eu-west-1`.

For a domain added after August 2026, Resend may show two CNAME records instead of the MX and TXT pair. Add those names and values exactly. Leave them unproxied.

In hPanel open Domains → purplehat.fun → DNS / DNS Zone. The name is the host only (`send` or `resend._domainkey`). Hostinger appends `purplehat.fun`.

After the records are visible, click Verify in Resend. Sending from `info@purplehat.fun` works once the domain shows verified. The DKIM value must match Resend exactly, with no extra quotes or line breaks.

“Approve access when they register” lets them sign in immediately. Leave it off if you want to approve the person after they register. You can also suspend access, edit details, and change a person between client and admin.

## Figures

New clients start with sample figures so the dashboard is not empty. Replace them on the person’s admin page. The client dashboard reads those figures from Thinking Hat and refreshes every few seconds. This app does not connect to an outside ledger, and it does not take card payments.

Uploads are limited to JPG, PNG, or WebP under 2 MB.
