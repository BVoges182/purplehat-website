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

- `JWT_SECRET` — long random string
- `ADMIN_EMAIL` — `admin@purplehat.fun`
- `ADMIN_PASSWORD` — the live admin password
- `DATA_DIR` — optional. Example: `/home/YOURUSER/thinking-hat-data`
- `APP_URL` — `https://purplehat.fun`
- `EMAIL_API_KEY` — Resend API key
- `EMAIL_FROM` — `info@purplehat.fun`
- `EMAIL_FROM_NAME` — `Purple Hat`

Invite email uses the Hostinger mailbox when `SMTP_PASSWORD` is set (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASSWORD`). Otherwise it uses Resend with `EMAIL_API_KEY`. Names and example values are in `server/.env.example`. The DNS records for Resend are listed under Invite email below.

Hostinger sets `PORT`. Express hides the build command, so `npm install` builds Thinking Hat itself. The database and photos are stored in `DATA_DIR`, or in `thinking-hat-data` in the home directory when the app is running from a Hostinger build. That folder is outside the deploy, so a later push does not wipe clients or photos.

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
