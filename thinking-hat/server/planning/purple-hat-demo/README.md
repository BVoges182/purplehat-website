# Purple Hat Demo LLC: planning seed data (demo only)

Fictitious demo data for the Budgets and Cash forecast tabs. There is no real client data and there are no secrets.

| File | What it holds |
| --- | --- |
| budget-fy2026.json | FY2026 v2 budget for Dec 2026 and YTD. REAL Dec 2026 actuals (copied from client/src/demoReportStatements.json). RAG thresholds. |
| budget-fy2027.json | FY2027 drivers, plus versions v1 (approved, locked) and Q1 reforecast (draft), each monthly by report line. |
| cash-13week-2027-01-04.json | 13-week direct forecast from REAL opening cash $71,970 and REAL 31 Dec AR/AP ageing. Scenarios, $50k minimum, risks and opportunities. |
| cash-monthly-fy2027.json | 12-month indirect forecast tied to FY2027 v1, the 13-week tie-out, and REAL Jul–Dec 2026 closing cash. |
| commentary-2026-12.json | Seeded "AI draft" variance commentary for Dec 2026. |

Line keys are stable IDs. Each budget line has a `rowType` of `input` or `total`. Totals are always recalculated and never trusted from input. That keeps the files ready to become admin uploads later via the Excel export or round trip. Everything not marked REAL is illustrative.
