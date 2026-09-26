# Changelog

## 0.1.1 — 2026-09-27

Security hardening (external audit).

- **CSV exports:** neutralize spreadsheet formula injection (`=`, `+`, `-`, `@`) in cells.
- **Backup restore:** full zod schema validation before any write; only tables present in
  the file are replaced (a partial/corrupt file can no longer wipe the database).
- **Access control:** route-level role gates for expenses, credit and stations; scope
  store rejects attendant widening; Reports nav now matches spec (attendant own closing).
- **PINs:** PBKDF2-SHA256 (100k iterations) replaces single-round SHA-256, constant-time
  hash comparison, progressive login backoff after repeated failures (seed v3 reseeds).
- **Headers:** production CSP meta tag + `no-referrer` (static hosting has no response headers).
- **Session:** 30-minute idle timeout with activity tracking.
- **CI:** workflow-level `permissions: contents: read`; all actions pinned to commit SHAs.
- **Service worker:** `ignoreSearch` cache fallback so RSC/?id= URLs resolve offline.

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
