# UI/UX Design — FuelOps (design system: DESIGN.md "Cohere" analysis)

Design intent: **editorial, restrained, operational.** White canvas, near-black pill
CTAs, hairline rules instead of shadowed cards, deep-green console band for "live ops",
coral reserved for alerts/taxonomy. Dense but breathable — a professional dashboard,
not a marketing page.

## 1. Design tokens → Tailwind v4 (`src/app/globals.css`)

```css
@theme {
  /* colors from DESIGN.md */
  --color-primary: #17171c;   --color-ink: #212121;      --color-canvas: #ffffff;
  --color-deep-green: #003c33; --color-dark-navy: #071829; --color-soft-stone: #eeece7;
  --color-pale-green: #edfce9; --color-pale-blue: #f1f5ff;
  --color-hairline: #d9d9dd;   --color-border-light: #e5e7eb; --color-card-border: #f2f2f2;
  --color-muted: #68687a;      --color-slate: #75758a;    --color-body-muted: #616161;
  --color-action-blue: #1863dc; --color-focus-blue: #4c6ee6;
  --color-coral: #ff7759;      --color-coral-soft: #ffad9b;
  --color-form-focus: #9b60aa; --color-error: #b30000;

  /* type */
  --font-display: var(--font-space-grotesk), "Inter", ui-sans-serif, system-ui;
  --font-sans: var(--font-inter), ui-sans-serif, system-ui;
  --font-mono: var(--font-jetbrains-mono), ui-monospace, monospace;
  --text-hero: 96px;   --text-hero--line-height: 1; --text-hero--letter-spacing: -1.92px;
  --text-display: 72px; --text-display--letter-spacing: -1.44px;
  --text-section: 60px; --text-section--letter-spacing: -1.2px;
  --text-card: 32px;   --text-card--letter-spacing: -0.32px;
  --text-feature: 24px; --text-feature--line-height: 1.3;
  --text-body-lg: 18px; --text-body-lg--line-height: 1.4;
  --text-mono-label: 14px; --text-mono-label--letter-spacing: 0.28px;
  --text-micro: 12px;

  /* radius */
  --radius-xs: 4px; --radius-sm: 8px; --radius-md: 16px;
  --radius-lg: 22px; --radius-xl: 30px; --radius-pill: 32px;

  /* spacing */
  --spacing-section: 80px;
}
```

Semantic data colors (added, kept flat): `positive: deep-green`, `warning: coral`,
`critical: error`, series palette `[action-blue, deep-green, coral, form-focus, slate]`.

## 2. Layout shell

```
┌──────────────────────────────────────────────────────────────────────┐
│ Announcement/status strip (36px, #000): "Offline — data saved        │
│ locally" | last sync note | demo hints                      ✕       │
├──────────────────────────────────────────────────────────────────────┤
│ Top bar: logo "FuelOps"  │ scope switcher (All ▾ / station)  ⌘K  🔔  │
│                           │ profile chip (name · role)        ⚙     │
├────────────┬─────────────────────────────────────────────────────────┤
│ Left rail   │  Page content (max-w-[1600px], px-6 lg:px-10)          │
│ Dashboard   │                                                         │
│ Stations    │                                                         │
│ POS         │   breadcrumbs (mono micro label) → H1 (display) → sub   │
│ Shifts      │                                                         │
│ Inventory   │                                                         │
│ Credit      │                                                         │
│ Expenses    │                                                         │
│ Reports     │                                                         │
│ Alerts ●n   │                                                         │
│ Settings    │                                                         │
└────────────┴─────────────────────────────────────────────────────────┘
```

- Left rail: 232 px desktop, icon-only 64 px tablet, drawer < 768 px.
  Active item = near-black pill (`--radius-pill`), white label.
- Scope switcher: switching to a station filters **every** page (session store).

## 3. Page compositions

### Dashboard
1. **Header row**: H1 "Network overview" (display, tight) + date-range pill group
   (Today / 7d / 30d / 90d) + Export.
2. **KPI strip** (6 cards): Revenue, Litres, Cash variance (coral/red when ≠ 0),
   Collections mix (mini stacked bar), Credit outstanding, Avg tank health.
   Card = white, 1px `card-border`, `radius-md`, mono micro label + big feature number.
3. **Live ops band** (full-width, `deep-green`, `radius-lg`, white text): open shifts
   per station with status chips (Open / Closing), active alerts count, quick action
   "Record sale". Mimics `agent-console-card`.
4. **Trend charts** (2-col): revenue + litres line/area (90d) — flat, hairline grid,
   pale-blue plot band; collections donut.
5. **Outlet leaderboard**: `research-table` style — rank, station, revenue, litres,
   variance chip, health — rule-separated rows, hover pale-green tint.
6. **Bottom row**: tank health bars per station · alerts feed · recent shifts.

### Stations / station detail
Card grid (soft-stone `product-card` style) → detail: header facts, dispenser+tank
panels (dark-navy mini console for live status), current shift module.

### POS
Two-pane: left = product/nozzle grid + keypad (₹ / L toggle) with big mono numbers;
right = receipt preview card (lines, payment pills: Cash/UPI/Card/Credit) + primary
pill "Complete sale". Retail tab = cart with SKU search. Success → toast + receipt
summary modal (printable).

### Shifts
List rows (station, name, attendant, open time, running cash) → detail: in-shift
ledger table + "Close shift" dialog: expected vs counted (big mono), variance chip,
note, confirm pill.

### Inventory
Tabs: Tanks | Deliveries | Shop stock. Tank rows show capacity bar (fill %),
book vs dip variance, last dip time, actions (Record dip / Record delivery).

### Credit
KPI row (outstanding, overdue, limit breaches) → aging donut/bar → customers table →
drawer with ledger + "Record payment".

### Expenses
Month filter + category pills; voucher table; "New voucher" sheet; bank deposits sub-list.

### Reports
Left: report picker (list). Right: parameter bar (station, date range) → table →
[CSV] [Print] pills. Print CSS: hide shell, A4 table.

### Alerts
Filter pills (severity) → rule-separated rows with coral (warning) / error (critical)
left markers; Acknowledge action; empty state.

### Settings
Sections: Stations, Price book, Staff & PINs, Demo data (reseed), Backup (export/
import JSON), Tolerance.

### Login / profile switch
Centered card on soft-stone: profile avatars (initials), PIN pad (4 digits, mono),
demo hint line. Offline-safe (session in localStorage).

## 4. Components inventory (`src/components/ui/`)

`Button` (primary pill / secondary underlined / outline pill / ghost) · `Card` ·
`StatCard` · `Chip`/`Badge` (ok/short/over/warning/critical) · `PillGroup` (segmented) ·
`DataTable` (sticky header, sortable, zebra-free, hairline rules) · `Field`/`Input`/
`Select`/`Textarea` (form-focus violet ring) · `Dialog` (focus trap, Esc, radius-lg) ·
`Drawer` · `Toast` (aria-live) · `Tabs` · `EmptyState` (thin-line geometric SVG) ·
`Skeleton` · `ProgressBar` (tank bars) · `KpiSparkline` · `ConfirmDialog`.

Icons: lucide, stroke 1.5, never filled. Illustrations: inline thin-line SVGs.

## 5. Interaction & motion

- Transitions 120–180 ms, `ease-out`; no parallax, no gradients.
- Buttons: primary pill inverts on hover (white bg / near-black text + hairline).
- Rows: hover `pale-green` 40 % tint; focus: 2 px `focus-blue` ring (visible only on
  keyboard focus via `:focus-visible`).
- ⌘K palette: fuzzy nav + quick actions (New sale, Record dip, Close shift, Go offline).
- Toasts bottom-right, 4 s, dismissible, `aria-live="polite"`.

## 6. Data-viz rules

- Flat marks, no gradients/shadows, rounded bar caps `4px`.
- Axis: hairline `#d9d9dd`, tick text micro `muted`.
- Every chart has: title + mono micro subtitle (range/scope), value units in
  axis label (₹ or L), and a text summary for a11y.
- Variance always signed (+/−) and colored (green/coral), never color-only (chip text).

## 7. Responsive

≥1280 full rail + 3-col cards · 1024 rail collapses to icons, 2-col · 768 drawer nav,
KPI 2-col · 375 single column, tables → stacked definition rows, POS keypad full-width.
Hero/display type scales down (96 → 48 px) below 768.

## 8. Accessibility

Focus-visible rings everywhere; dialog focus trap; form errors linked via
`aria-describedby` + `aria-invalid`; charts get `<figcaption>`/sr-only summaries;
color contrast ≥ 4.5:1 (muted #68687a meets AA on white and stone, body uses
#616161); touch targets ≥ 40 px.

## 9. Do / Don't (adapted)

- DO: white canvas, hairline rules, pill CTAs, mono micro labels, coral only for
  alerts/taxonomy, dark bands for live ops.
- DON'T: drop shadows, gradient fills, coral/blue surface backgrounds, cute rounding
  below 8px on cards, one generic sans for everything.
