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

## Invite keys

1. Sign in as admin.
2. Open Invite keys and create a key.
3. Copy the key. It is shown once. Email it to the client.
4. They open Register, enter the key, and create an account.

“Approve access when they register” lets them sign in immediately. Leave it off if you want to approve the person after they register. You can also suspend access, edit details, and change a person between client and admin.

## Figures

New clients start with sample figures so the dashboard is not empty. Replace them on the person’s admin page. The client dashboard reads those figures from Thinking Hat and refreshes every few seconds. Xero and QuickBooks stay the system of record. This app does not connect to them, and it does not take card payments.

Uploads are limited to JPG, PNG, or WebP under 2 MB.
