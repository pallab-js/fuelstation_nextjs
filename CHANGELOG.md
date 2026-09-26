# Changelog

## 0.1.2 — 2026-09-27

UI/UX review pass (desktop + 375px mobile screenshot audit).

- **Stations:** removed stray `return (` that rendered as literal text on the grid and
  detail console; reconciliation status now reads `reconciled`/`short`/`over`
  (the mono `OK` was misread as `0K`); dip stamp shows relative time instead of the
  wrapping full date-time.
- **POS:** keypad restructured — quick amounts + backspace on their own 4-up row,
  digits in a fixed 3-column grid (the shared grid scrambled rows at both breakpoints).
- **Dashboard:** single "Hourly pattern" label (was duplicated + stray alert icon);
  revenue trend now plots completed days only — the partial "today" bucket no longer
  creates a misleading end-of-line cliff (KPIs still include today).
- **Charts:** revenue-trend card renders on mobile (flex child had no floor height,
  collapsing `ResponsiveContainer` to 0).
- **Long lists:** vouchers, deposits and the dip log show the 50 newest rows with a
  count footnote instead of rendering hundreds of rows.
- **Tables:** `whitespace-nowrap` everywhere — numeric/date cells scroll horizontally
  instead of wrapping; reports daily rows show `28 Aug 2026` (display only — CSV keeps
  ISO keys, now bucketed by local day like the rest of the app).
- **Consistency:** alerts meta separator (`TYPE · STATION`), alert message dates use
  the shared `date()` formatter, credit overdue ages are always `Nd ago`, settings
  button label no longer ends in an ellipsis.
- **Seed:** ST-09 overnight theft always lands in the past (falls back to 23:00
  yesterday before 02:00), so the critical scenario is live at any hour (seed v4).
- Refreshed README screenshots; verified with the 21-check Brave smoke + visual pass.

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
