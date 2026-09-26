# Changelog

## 0.1.0 — 2026-09-27

Initial prototype.

- Local-first core: Dexie/IndexedDB schema, deterministic 90-day seed (5 outlets),
  pure domain modules with unit tests (money, variance, aging, analytics, alerts).
- Pages: dashboard, stations (+ detail console), POS, shifts, inventory, credit,
  expenses, reports (7 types, CSV + print), alerts, settings (staff/PIN, price book,
  backup/restore, reseed).
- Alerts engine: critical/low stock, wet-stock variance, shift-open-long,
  cash short/over, credit limit/overdue, low retail stock — idempotent, ack-able,
  focused feed (≤ ~18 seeded alerts).
- PWA: static export + generated service worker (125 precached URLs), offline page,
  verified airplane-mode navigation in E2E.
- Quality: ESLint, `tsc --noEmit`, 22 Vitest specs, Brave/Playwright E2E smoke (21 checks),
  CI workflow (verify + GitHub Pages deploy).
