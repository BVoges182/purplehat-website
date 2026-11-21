# Ledger Navy screenshots

Light files sit in this folder. Dark files sit in `dark/`. Files named `*-dark-*` in this folder (dashboard, report, statement tabs, and the older home pair that this pass replaced) are the set from commit 74bb9ba, before the contrast fixes. This pass overwrote `home-light-1440.png` and `home-light-390.png` and added the files below.

Signed-in shots are from the local demo account on the December 2026 management report. Light files are in this folder. Dark files are in `dark/`. The management report PDF page shots (`pdf-page-1.png`, `pdf-statement-3.png`) are still the earlier light Ledger Navy renders. Annual-statement notes 1–14 are not separate screenshots. The saved US GAAP Demo template has no quarterly profit and loss section, so that section is not in these shots.

## This pass

| File | Proves |
|---|---|
| `home-light-1440.png`, `home-light-390.png`, `dark/home-dark-1440.png`, `dark/home-dark-390.png` | Marketing homepage chrome in both themes (item 1 chrome; slide bitmaps not recaptured) |
| `home-statements-light-1440.png`, `home-statements-light-390.png`, `dark/home-statements-dark-1440.png`, `dark/home-statements-dark-390.png` | Live management-report slide: navy headers, `#CCEEFF` / dark total bands, square cards |
| `booking-calendar-light-1440.png`, `booking-calendar-light-390.png`, `dark/booking-calendar-dark-1440.png`, `dark/booking-calendar-dark-390.png` | November: available fill, selected day, today outline, unavailable grey, legend (item 2) |
| `booking-calendar-next-light-1440.png`, `booking-calendar-next-light-390.png`, `dark/booking-calendar-next-dark-1440.png`, `dark/booking-calendar-next-dark-390.png` | December page of the 14-day window (1–4 December 2026 available) |
| `login-light-1440.png`, `login-light-390.png` | Light Sign in: white on navy, active Light tab with bar (items 5 and 6) |
| `dark/login-dark-1440.png`, `dark/login-dark-390.png` | Dark Sign in: navy on `#CCEEFF` (item 6) |
| `register-light-1440.png`, `register-light-390.png`, `dark/register-dark-1440.png`, `dark/register-dark-390.png` | Create account button, both themes |
| `forgot-password-light-1440.png`, `forgot-password-light-390.png`, `dark/forgot-password-dark-1440.png`, `dark/forgot-password-dark-390.png` | Send reset link, both themes |
| `reset-password-light-1440.png`, `reset-password-light-390.png`, `dark/reset-password-dark-1440.png`, `dark/reset-password-dark-390.png` | Reset page without a token (invalid-link state; the submit button is the same shared Button) |

Measured in the browser, not only from the pictures: calendar available, selected, and unavailable colours; today outline; Barlow Condensed on the day numbers; Sign in, Create account, and Send reset link fill and text in both themes; statement total band and text; compact statement radius `0`.

## Signed-in app

Each row has `*-light-1440.png` and `*-light-390.png` here, and `*-dark-1440.png` and `*-dark-390.png` in `dark/`. At 1440 the header shows the active tab. At 390 the open menu is the matching `nav-*-390.png` file.

| File stem | Proves |
|---|---|
| `dashboard` | Dashboard with the original-colour logo, KPI cards, and the top of the executive summary |
| `nav-dashboard`, `nav-reports`, `nav-statements`, `nav-billing`, `nav-request`, `nav-business` | Phone menu with that tab active (390 only) |
| `insights` | Financial insights brief: receivables, payables, this month, and trends |
| `reports`, `report-executive`, `report-pnl`, `report-balance`, `report-cash`, `report-ecommerce` | Management Reports for December 2026, including profit and loss, balance sheet, cash flows, and e-commerce |
| `statements`, `afs-cover`, `afs-index`, `afs-auditor`, `afs-balance-sheets`, `afs-operations`, `afs-equity`, `afs-cash-flows` | Annual statements with the section menu. Statement body stays as published; only the menu chrome follows the theme |
| `billing`, `request`, `business` | Billing, Request Build, and Business |

## Featured services

`images/app` was recaptured from the live Ledger Navy app in light mode. Desktop files are 2880×1800. Phone files are 780×1688. Each PNG has a matching WebP at the same pixel size: `dashboard-ads`, `dashboard-mix`, `dashboard-overview`, `report-charts`, `report-kpis`, `report-summary`, `statement-cash`, `statement-income`, `statement-position`, `mobile-aging`, `mobile-dashboard`, and `mobile-summary`. The homepage uses every pair except `dashboard-ads`.
