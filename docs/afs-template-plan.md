# Annual financial statements

The audited set follows the management-report path: an admin uploads an .xlsx, the server parses and validates it, and the client reads the stored JSON. Management-report months, parsers, and pages stay as they are.

## Data
- `client_templates.period` gains `annual`.
- `client_templates.afs_json` stores the year end, comparative year, framework, audit status, auditor name, firm, and report date.
- Sections stay in `sections_json`. Annual templates use the `afs-*` section types. Admins hide and reorder them with the existing section editor. Those types are offered only when the template period is annual.
- `annual_statements` stores one row per upload: client, `year_end`, version, `draft` or `published`, parsed JSON, and the original `.xlsx` under the uploads directory. The client sees the latest published version.

## Routes
- `POST /api/admin/annual-statements` uploads a workbook for a client and year end. Validation errors are returned and publishing is refused.
- `GET /api/admin/annual-statements/:id` is the admin preview.
- `POST /api/admin/annual-statements/:id/publish` publishes a valid draft.
- `GET /api/me/annual-statements` lists published years for the signed-in client. Admins pass `userId`.
- `GET /api/me/annual-statements/:year` returns the published set. `:year/pdf` and `:year/xlsx` download it.
- The same read and download routes exist under `/api/admin/users/:id/annual-statements/:year`.

## Screens
- Client Template Builder: seeded template “Annual Financial Statements (Audited, US GAAP)” on Purple Hat Demo LLC, period Annual.
- Admin > Management Reports: “Upload Annual Financial Statements (.xlsx)” beside the monthly upload, then a preview of the client page and Publish.
- Client > Financial Statements: the SEC-style set when a published year exists. Clients without one keep the current statement cards.

## Files
- `thinking-hat/server/src/annualWorkbook.js` parses values (formulas are evaluated, not shown) and validates the tie-outs.
- `thinking-hat/server/src/annualStore.js` saves versions and seeds the sample workbook.
- `thinking-hat/client/src/components/AnnualStatementView.jsx` renders the set.
- `thinking-hat/server/src/fixtures/PurpleHatDemo_Audited_FS_FY2026.xlsx` is the sample upload.
