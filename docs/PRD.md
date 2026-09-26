# PRD — FuelOps: Multi-Outlet Fuel Station Management Dashboard

**Status:** Prototype v0.1 (for project demonstration) · **License:** MIT · **Locale:** INR / en-IN (litres)

## 1. Problem statement

Owners and managers who run several fuel retail outlets rely on phone calls, WhatsApp
updates, paper shift registers and per-station spreadsheets. There is no single place to
answer, right now:

- How much did the network sell today, per outlet and per product?
- Which shift is short/over cash, and by how much?
- Which tanks are running low, and is wet stock matching meter sales?
- How much credit is outstanding, and who has crossed their limit?

FuelOps replaces that patchwork with **one central, professional-grade, offline-capable
dashboard**.

## 2. Product goals

| # | Goal | Success signal |
|---|------|----------------|
| G1 | Single glass pane across all outlets | Network KPIs visible within 3 s of app open |
| G2 | Catch cash & fuel leakage same-day | Variance computed automatically at every shift close |
| G3 | Operate with no internet (demos, rural sites) | Full flow works in airplane mode after first load |
| G4 | Super-practical everyday UX | Core actions (record sale, dip, close shift) ≤ 3 taps |
| G5 | Ship open-source on GitHub | Reproducible build, MIT, CI-green, GH Pages demo |

Non-goals for prototype: pump/ERP hardware integrations, cloud sync, real payments,
multi-currency, i18n, payroll accounting, tax/VAT filing.

## 3. Personas

1. **Chain owner (Anita)** — 5 outlets, wants morning numbers, leaderboards, variance
   flags, credit exposure, one login.
2. **Station manager (Ravi)** — one outlet: shifts, deliveries, dips, expenses, reports.
3. **Attendant / shift supervisor (Imran)** — opens shift, records sales, closes with
   counted cash; sees only his station.
4. **Accountant (Meera)** — credit ledger, aging, expense vouchers, exportable reports.

## 4. Feature requirements (MoSCoW)

### Must (core set)
- **M1 Network dashboard** — KPI cards (revenue, litres, variance, collections mix,
  credit outstanding, tank health), 90-day trends, outlet leaderboard, product mix,
  live-ops band (open shifts, active alerts).
- **M2 Outlet management** — station profiles, dispensers/nozzles, tanks, price book
  with price history.
- **M3 POS / sale entry** — fuel sale (litres or ₹, nozzle/product, payment mode,
  credit customer) and retail (shop) cart checkout; receipt summary.
- **M4 Shifts & reconciliation** — open shift with opening cash + totalizers, record
  sales/expenses/deposits in-shift, close with counted cash → automatic short/over
  variance + tolerance status.
- **M5 Tank & wet-stock** — dip readings, deliveries, live level %, book vs dip
  variance %, low/critical stock alerts.
- **M6 Retail inventory** — shop SKUs, stock on hand, low-stock alerts, shop sales.
- **M7 Credit & fleet customers** — credit accounts with limits, vehicle records,
  charge/payment ledger, 0/30/60/90+ aging, limit-breach alerts.
- **M8 Expenses & cash** — expense vouchers (petty cash), bank deposits, cash book
  view per station.
- **M9 Reports & exports** — daily closing, sales summary, variance, credit aging,
  inventory; CSV export + print-friendly view.
- **M10 Alerts centre** — stock, variance, cash, credit, long-open-shift alerts;
  acknowledge flow.
- **M11 Offline PWA** — installable, service-worker precache, full offline operation,
  offline indicator.
- **M12 Local profiles & roles** — profile switcher + 4-digit PIN; Owner / Manager /
  Attendant scoping (station visibility + action rights).

### Should
- Command palette (⌘K) for navigation + quick actions.
- JSON backup export/import of the whole database (local-first portability).
- Demo-data reseeding with deterministic scenarios (short shift, low tank, overdue credit).

### Could (post-prototype)
- Real pump/EDR integration, cloud sync with conflict resolution, push notifications,
  GST invoice formats, loyalty, multi-tenant cloud hosting.

## 5. User stories (acceptance-level)

| ID | Story | Acceptance |
|----|-------|-----------|
| US1 | As an owner I open the app and see today's network revenue, litres and flagged variances | KPIs computed from IndexedDB, per outlet + total, no network calls |
| US2 | As an owner I compare outlets over 90 days | Leaderboard bar chart + trend chart with date-range toggle |
| US3 | As a manager I open a shift with opening cash | Shift record created; opening totalizers pulled from last close |
| US4 | As an attendant I record a ₹500 petrol sale on UPI | Sale written with price, litres, nozzle, shift; dashboard updates live |
| US5 | As a manager I close a shift with counted cash | Variance = counted − expected; status ok/short/over vs tolerance; alert if short |
| US6 | As a manager I record a dip reading | Tank level % updates; book-vs-dip variance shown; low/critical alert raised |
| US7 | As an accountant I see overdue credit | Aging buckets chart + per-customer due amounts; limit-breach alert |
| US8 | As any user I lose internet mid-shift | App keeps working; offline pill shown; no data lost |
| US9 | As an owner I restrict an attendant to one station | Attendant's scope dropdown and nav show only their station |
| US10 | As a demo operator I reset to seeded data | Settings → Reset demo data restores deterministic dataset |

## 6. Personas × screens (IA summary)

Owner: Dashboard → Stations → Shifts → Inventory → Credit → Expenses → Reports →
Alerts → Settings. Manager: same minus cross-station aggregation. Attendant: POS,
own station shift, dip entry.

## 7. Success metrics for the demo

- Cold load to interactive dashboard < 3 s (local), full flow usable offline.
- 0 lint / typecheck / test errors; `next build` static export passes.
- Every KPI traceable to a visible transaction (drill-down or report).
- Usable at 375 px width and with keyboard only (WCAG 2.1 AA focus states).

## 8. Release & distribution

GitHub repo (MIT), GitHub Pages static demo, seeded demo data, README with screenshots
and a 3-minute demo script (open → POS sale → close shift → variance flag → offline).
