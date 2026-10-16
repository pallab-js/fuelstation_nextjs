# Changelog

## 0.1.10 — 2026-10-16

Dev-server quality-of-life.

- Added `allowedDevOrigins` to `next.config.ts` so `next dev` resources (HMR) can
  be reached from other devices on the LAN — e.g. opening the app on a phone/tablet
  at `http://192.168.x.x:3000` to test the mobile touch-target work. Dev-only;
  ignored by the `output: "export"` production build, so the deployed artifact is
  unchanged (verified: `next build` still compiles).

## 0.1.9 — 2026-10-16

Fix: desktop sidebar scrolled out of view with the page.

- The sidebar was a plain flex child in the body scroll flow, so it scrolled away
  with the page content. It is now `sticky` beneath the 56px top bar
  (`top-14`, `self-start` to escape flex stretch, with its own
  `overflow-y-auto` guard), so it stays fixed while only the main page view
  scrolls.
- Verified: lint / typecheck / build + service worker green.

## 0.1.8 — 2026-10-16

Localise the demo dataset to an Assam-based business.

- **Stations** relocated to Assam: Guwahati, Dibrugarh, Silchar, Jorhat and Tezpur,
  with local addresses and the real NH-37 corridor for the Dibrugarh outlet (station
  record `id`s unchanged, so planted demo scenarios and references are preserved).
- **Customers** renamed to regional fleets/traders (Brahmaputra Logistics, Kamrup
  Couriers, Dibrugarh Cabs, Barak Transport, Kaziranga Travels, Hazarika Traders)
  with `AS`-series vehicle registrations.
- **Staff** given Assamese surnames (demo first names Anita / Ravi / Imran kept so the
  README sign-in hint stays accurate); phone prefixes updated.
- **Suppliers** localised to Assam depots/terminals (IOCL Guwahati Terminal, IOCL
  Digboi Refinery, BPCL Betkuchi Depot, HPCL Guwahati Depot); runtime delivery
  supplier fallback updated to match.
- `SEED_VERSION` bumped 4 → 5 so existing local databases re-seed with the new data.
- README prototype-scope line notes the Assam setting.
- Verified: lint / typecheck / 50 tests (demo-shape + planted scenarios) / build green.

## 0.1.7 — 2026-10-16

UI polish follow-ups (deferred items from the UI review).

- **StatCard large numbers:** KPI value font now steps down on narrow grids
  (26 → 30 → 34px) and wraps instead of overflowing the card on a 2-column mobile
  layout.
- **Sticky-header anchor offset:** global `scroll-margin-top` on `:target` and
  id-bearing headings/sections so in-page anchors don't land under the 56px sticky
  top bar.
- **Toolbar stability:** the online/offline indicator no longer reflows the top-bar
  actions when connectivity flips — a single spacer owns the push-right, and the
  chip collapses to "Offline" on very small screens.
- Verified: lint / typecheck / 50 tests / build + service worker green. No README
  change required (no documented behaviour, command or feature changed).

## 0.1.6 — 2026-10-16

UI mobile + consistency pass (from a UI/responsiveness review).

- **Touch targets (WCAG 2.5.5/2.5.8):** new `IconButton` primitive with a
  guaranteed 44×44px hit area; POS cart steppers and inventory stock steppers
  raised 32 → 44px; topbar bell / scope / search / profile controls raised to a
  44px minimum.
- **Icon consistency:** raw `☰` / `✕` text glyphs replaced with lucide
  `Menu` / `X` across the topbar, mobile nav drawer and toasts (consistent stroke
  weight; no platform emoji-font fallback).
- **Button system:** decoupled `size` from `variant` — the `size` prop is now
  always honoured (`sm`/`md`/`lg` map to real min-heights) and the corner radius is
  unified to pill. Previously `outline`/`secondary` silently overrode size and
  radius, so buttons sharing a dialog footer rendered at different heights/shapes.
- **Responsiveness:** scope-switcher dropdown clamped to `max-h-[60vh]` with
  internal scroll and a viewport-aware width so it can't overflow a 375px screen;
  `DataTable` gains a right-edge gradient fade on mobile to signal
  horizontally-scrollable columns.
- **Accessibility:** `Field` now wires `aria-invalid` + `aria-describedby` from the
  error message to its control, and invalid controls show a red border.
- **Cleanup:** removed a dead identical-branch ternary on the sidebar alert badge.
- Verified: lint / typecheck / 50 tests / build + service worker green.

## 0.1.5 — 2026-10-16

Security remediation pass (findings from a source-level security assessment).

- **Backup import/merge credential warning (V2):** restoring or merging a JSON
  backup can overwrite the staff table — including login PIN hashes and roles — or
  inject new staff accounts (merge resolves newer records last-write-wins). Both
  actions now route through a confirmation dialog that names the file and warns the
  owner that staff credentials may change, before any write runs. Prevents a trusted
  owner from silently importing a credential-bearing file.
- **Next.js 16.3.6 → 16.4.2 (V3):** patches the direct `next` advisories (Image
  Optimization SSRF, SSG/ISR cache poisoning, Draft Mode leak, dev MCP info
  disclosure) and `sharp`. These target server runtime features and are not reachable
  in this app's static export, so the bump is defense-in-depth; `npm audit` high
  count 8 → 6. The remaining advisories are dev-only (ESLint `fast-glob`/`micromatch`/
  `braces`) or build-time (`source-map-js`) and are not in the shipped artifact.
- Verified: lint / typecheck / 50 tests / build + service worker green.

Not changed (documented in the assessment, require a product decision or a move off
static hosting): client-only authorization is still forgeable via devtools; the PIN
backoff remains an in-memory speed-bump; CSP ships as a meta tag with `'unsafe-inline'`
and no `frame-ancestors` (static hosting cannot set real response headers).

## 0.1.4 — 2026-10-16

Post-review hardening pass (correctness, performance, local sync groundwork).

- **Atomic receipt / voucher numbering:** sequence numbers were derived from
  `table.count() + 1` outside the write transaction, so two concurrent sales (two
  tabs or a double-submit) could mint duplicate receipt numbers. Added a
  transactional monotonic counter (`nextSequence` in `repo/common.ts`); receipt and
  voucher allocation now happens inside the same `rw` transaction as the insert.
  Counters seed from the existing row count so numbering is continuous with
  pre-existing data.
- **Credit adjustment sign convention:** documented and tested that a positive
  `adjustCredit` amount increases the balance (surcharge) and a negative amount
  decreases it (write-off / goodwill credit); added a zero-amount guard.
- **Indexed scope queries:** dashboard / station-cards / inventory / report loaders
  no longer pull every station's rows into memory and filter in JS. When scoped to a
  single station they read through the `[stationId+ts]` / `stationId` indexes; the
  network-wide ("all") scope keeps the original range-index path. Output is
  equivalent (invariant documented in `repo/queries.ts`).
- **Non-destructive backup Merge:** new pure merge engine (`repo/merge.ts`) and
  `mergeBackup` combine another device's JSON export into the local database without
  clearing rows — append-only ledgers union, mutable rows resolve last-write-wins by
  `updatedAt`. Exposed as a "Merge JSON" action in Settings alongside Import
  (replace). This is the local, transport-free core of the planned sync layer.
- **Docs:** README softened to match reality — PIN login backoff is an in-memory
  client-side speed-bump (not a brute-force control); role gating is client-only.
- Verified: lint / typecheck / 50 tests / build green (test count 31 → 50).

## 0.1.3 — 2026-09-27

Lighthouse sanity pass (perf / accessibility / PWA).

- **Accessibility 94 → 100:** muted text token darkened `#93939f` → `#68687a`
  (≥ 4.5:1 AA on white and stone backgrounds — 12px mono-labels previously failed
  contrast); chart axis ticks updated to match; DESIGN.md / docs updated.
- **PWA splash screen:** real PNG icons generated (`icon-192`, `icon-512`,
  `icon-maskable-512` — maskable on full-bleed theme color) and registered in the
  manifest; Lighthouse's "PNG ≥ 512px" requirement now passes.
- **First-load performance 27 → 60 (emulated slow-4G + 4× CPU):** seed generation
  now cooperatively yields to the event loop every day / every 300 events instead of
  running as multi-second main-thread blocks (TBT 2,830 → ~1,600 ms; production is
  better — GitHub Pages serves brotli, the audit's local server now does too).
- **CLS 0.38 → 0.003:** the login profile list renders reserved-size skeleton rows
  (exact 72.5px row geometry), so the list appearing no longer reflows the card; the
  boot splash label has a fixed width so phase-text changes don't shift it.
- Verified: lint/typecheck/31 tests/build green, Brave smoke 21/21, visual probes.
- Recorded result: **performance 60 · accessibility 100 · best-practices 100 ·
  PWA 88** — the lone PWA sub-fail (`content-width`) is a flaky headless
  `window.outerWidth` artifact (413–418 px across identical runs); the app has zero
  real horizontal overflow at 375/412/1440.

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
