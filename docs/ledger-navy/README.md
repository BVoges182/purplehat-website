# Ledger Navy screenshots

Light files sit in this folder. Dark files sit in `dark/`. Files named `*-dark-*` in this folder (dashboard, report, statement tabs, and the older home pair that this pass replaced) are the set from commit 74bb9ba, before the contrast fixes. This pass overwrote `home-light-1440.png` and `home-light-390.png` and added the files below.

`PH_DEMO_PASSWORD` was unset, so signed-in app screenshots, the Featured services recapture, and the annual-statement pixel diff are not in this commit. The management report PDF page shots (`pdf-page-1.png`, `pdf-statement-3.png`) are still the earlier light Ledger Navy renders.

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
