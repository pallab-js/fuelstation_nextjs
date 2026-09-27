# Implementation Plan

Phased delivery for the FuelOps prototype. Every phase ends with
`lint + typecheck + test + build` green.

## P0 — Repo & planning ✅
- [x] git init (main), create-next-app (TS, Tailwind v4, App Router, src dir)
- [x] MIT `LICENSE`, CI workflow (verify + GitHub Pages deploy), scripts
  (`typecheck`, `test`, `preview`, `postbuild` SW)
- [x] Planning docs: PRD, SDA, TRD, schema, app-logic, UI-UX, this file
- [x] Static export config (`output: 'export'`, env-driven basePath)

## P1 — Design system & shell ✅
- [x] `globals.css` tokens from DESIGN.md (colors/type/radius/spacing) + base layer
- [x] Fonts: Space Grotesk (display) / Inter (body) / JetBrains Mono (labels) via next/font
- [x] UI primitives: Button, Card, StatCard, Chip, PillGroup, DataTable, Field/Input/
      Select, Dialog, Drawer, Toast, Tabs, EmptyState, Skeleton, ProgressBar, ConfirmDialog
- [x] App shell: status strip, top bar (scope switcher, profile chip, ⌘K, alerts bell),
      left rail nav with active pill + mobile drawer, offline indicator
- [x] Session store (zustand): profile, role, scope; route guard redirects to `/login`
- [x] Chart theme wrapper (Recharts + token colors)

**Exit:** login → dashboard placeholder renders on-brand, responsive, keyboard-OK.

## P2 — Data layer ✅
- [x] `lib/db/dexie.ts` schema v1 (all tables/indexes from docs/schema.md)
- [x] Domain pure modules: `money.ts`, `dates.ts`, `variance.ts`, `aging.ts`,
      `totals.ts`, `format.ts`, `analytics.ts` (+ unit tests)
- [x] Seeded RNG + `seed.ts` (5 stations, 90 days, planted edge scenarios) with progress UI
- [x] Repositories: stations/staff, products/prices, pumps/tanks/dips/deliveries,
      shifts/sales/pos, credit, expenses/deposits, retail, alerts, reports, settings/backup
- [x] Alert evaluation engine + audit log helper
- [x] zod schemas shared by repo + forms

**Exit:** seeded DB; unit tests green; reseed works. ✓ (22 tests, seed ≤ 18 alerts)

## P3 — Core operational pages ✅
- [x] `/login` profile + PIN pad
- [x] `/dashboard` full composition (KPIs, live-ops band, trends, leaderboard, tanks, alerts)
- [x] `/stations` list + detail (dispensers, tanks, current shift)
- [x] `/pos` fuel + retail checkout with receipt modal
- [x] `/shifts` open / in-shift ledger / close with reconciliation dialog
- [x] `/inventory` tanks (dip/delivery forms), deliveries, shop stock
- [x] Live navigation between flows (record sale → dashboard updates)

**Exit:** demo script works end-to-end offline. ✓ (E2E smoke 21/21)

## P4 — Extended modules ✅
- [x] `/credit` customers, ledger drawer, payments, aging chart, limit alerts
- [x] `/expenses` vouchers + bank deposits + cash book summary
- [x] `/reports` 7 report types × filters × CSV export × print styles
- [x] `/alerts` centre with severity filters + acknowledge
- [x] `/settings` stations, price book, staff & PINs, tolerance, reseed, JSON backup

## P5 — Hardening & release
- [x] PWA: `manifest.ts` + icons, `scripts/build-sw.mjs` (hashed precache), offline page,
      update toast, installable check (offline reload verified in E2E)
- [x] Role gating pass (owner/manager/attendant), station scope enforcement
- [x] ⌘K palette; toasts; empty/error states; a11y sweep (focus, labels, contrast)
- [x] Responsive sweep 375 → 1440 (375px overflow check in E2E)
- [x] README (screenshots, demo script, badges) + CHANGELOG + repo metadata (description, topics, Pages)
- [x] UI/UX review pass: desktop + 375px screenshot audit — stations JSX text bug, POS
      keypad grid, duplicate hourly label, mobile revenue-trend collapse, list caps,
      date/relative consistency, ST-09 theft always in the past (see CHANGELOG 0.1.2)
- [x] Final gate: `npm run lint && npm run typecheck && npm test && npm run build` ✓
      + airplane-mode pass ✓ (E2E offline)
      + Lighthouse sanity (local, Brave headless): performance 60 · accessibility 100 ·
        best-practices 100 · PWA 88 — the only PWA sub-fail is `content-width`, a
        flaky `window.outerWidth` artifact in headless (values 413–418 across runs on
        identical builds); the app itself has zero horizontal overflow (scrollWidth ==
        viewport verified at 375/412/1440). Not run in CI.

## Demo script (for showcase)
1. Open `/login` → pick **Anita (Owner)** → PIN `1234`.
2. Dashboard: network KPIs, 90-day trends, leaderboard — point out offline pill.
3. ⌘K → "New sale" → POS: ₹1,000 Petrol, UPI → receipt.
4. Shifts → close a shift with ₹200 short → coral variance chip + critical alert fires.
5. Inventory → record a dip below critical → tank bar turns coral, alert appears.
6. Credit → show 31–60 bucket + limit-breach customer.
7. Reports → Daily closing → CSV download.
8. DevTools → Offline → keep navigating/working; reload still works (SW).
9. Settings → Export backup JSON.

## Risks / contingency
| Risk | Fallback |
|---|---|
| Seeding too slow (>2 s) | reduce to 60 days / batch inserts, show progress |
| Recharts bundle too big | lazy `next/dynamic` per chart; sparklines as inline SVG |
| Static export + Suspense/searchParams friction | keep detail state in zustand when links aren't needed |
| SW caching pitfalls | keep strategies minimal; verify with airplane-mode pass |
