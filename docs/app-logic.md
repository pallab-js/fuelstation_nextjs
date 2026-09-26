# App Logic — domain rules & algorithms

All functions live in `src/lib/domain/*` (pure, unit-tested) and are invoked from the
repository layer (`src/lib/repo/*`). Money = paise, volume = ml, timestamps = epoch ms.

## 1. Cash reconciliation (shift close)

```
expected = openingCash
         + Σ fuel sales where payment=cash
         + Σ retail sales where payment=cash
         − Σ in-shift expenses paidBy=cash
         − Σ in-shift bank deposits
variance = counted − expected
status   = |variance| ≤ station.tolerancePaise ? 'ok'
         : variance < 0 ? 'short' : 'over'
```
- Persist a `reconciliations` row, mark shift `closed` (also closes its sales batch).
- `status !== 'ok'` → raise `cash-short` alert (critical when short, warning when over).
- Expected cash is shown live in the close dialog while typing `counted`.

## 2. Wet-stock (tank) reconciliation

```
bookLevel = latestDip.levelMl
          + Σ deliveries to tank since latestDip.ts
          − Σ fuel sales of product at station since latestDip.ts
variancePct = (dip.levelMl − bookLevel) / bookLevel × 100
```
- Displayed as "Book vs Dip" on tank cards.
- `|variancePct| > 0.5` → `wet-stock-variance` warning; `> 1.0` → critical.
- Current tank level for dashboards uses **bookLevel** (dip anchors it daily).

## 3. Tank levels & alerts

```
pct = bookLevel / capacityMl × 100
pct ≤ criticalLevelPct → 'critical-stock'
pct ≤ safeLevelPct     → 'low-stock'
```
Alerts are (re)evaluated after: sale, delivery, dip, price change, seed, shift close.
De-duped by `(type, tankId)` while unacked.

## 4. Credit ledger & aging

- A fuel sale with `payment='credit'` inserts a `creditTxns {type:'charge', dueTs = ts + dueDays}`.
- A payment inserts `{type:'payment'}` (negative effect).
- `balance(customer) = Σ charges − Σ payments + Σ adjustments`.
- **Aging buckets** at time `now`:
  `0–30`: unpaid charge amount where `now − dueTs ≤ 30d`; `31–60`, `61–90`, `90+` similarly;
  not-yet-due amounts land in "current".
- `balance > creditLimitPaise` → `credit-limit` critical alert (per customer).
- Oldest unpaid due > 7 days → `credit-overdue` warning.

## 5. Shift lifecycle

```
open(stationId, staffId, name, openingCash):
  last = latest closed shift of station
  openingTotalizers = last?.closingTotalizers ?? current nozzles.totalizerMl
  → shifts {status:'open'}

close(shiftId, countedPaise):        # §1
  writes reconciliation, snapshots closingTotalizers from nozzles
  → status:'closed'
```
- Only one open shift per station (enforced in repo).
- Shift open > 10 h → `shift-open-long` warning (checked when dashboard loads).
- POS refuses sales when the station has no open shift (guides the attendant).

## 6. Sale posting (POS)

```
validate(product, litres|amount, payment, station has open shift, customer limit*)
price   = current price snapshot from fuelProducts (or retailItem.price)
litres  = amount / price   (whichever is the input; rounded to 0.01 L → ml int)
write sales row → totalizer += ml → retailItem.stockQty −= qty (retail)
*credit: warn/soft-block if balance + amount > limit (attendant can't override)
```
Price changes keep `priceHistory` so historical sales retain their snapshot price.

## 7. Analytics selectors (dashboard / reports)

| Selector | Definition |
|---|---|
| `revenue(range, scope)` | Σ amountPaise of sales, split by kind/payment/product |
| `volume(range, scope)` | Σ quantityMl by product (fuel only) |
| `collectionsMix` | share of cash/upi/card/credit paise |
| `marginEstimate` | Σ (unitPrice − configured cost) × ml — estimate chip only |
| `outletLeaderboard` | per-station revenue + litres + variance% for range |
| `trend(range)` | daily buckets (revenue, litres, variance) |
| `varianceTrend` | per-day Σ reconciliation variancePaise |
| `tankHealth` | per-tank pct + status |
| `creditAging` | §4 buckets network-wide |
| `hourlyPattern` | Σ sales by hour-of-day (avg) |

Scope resolution: `session.scope = 'all' | stationId`; all selectors take scope first.

## 8. Seeding (demo data)

- mulberry32 PRNG with fixed seed → deterministic across machines.
- **5 stations**, 3 shifts/day, ~4–8 sales/shift (aggregated, not per-nozzle events),
  90 days history → ~8–12k rows (fast seed, feels real).
- Weekday/weekend demand curves, seasonal drift, random price revisions (mid-month),
  deliveries every 4–6 days, 2 dips/day/station, fleet customers with aging,
  hand-planted scenarios: one cash-short shift, one critical tank, two overdue credits.
- Runs once on first launch (`settings.seedVersion` guard) with a progress screen;
  reseedable from Settings (destructive, confirmed).

## 9. Roles & scoping

| Capability | Owner | Manager | Attendant |
|---|---|---|---|
| See all stations / switch scope | ✓ | own only* | own only |
| Record sale, dip, open/close shift | ✓ | ✓ | ✓ (own station) |
| Expenses, deliveries, retail stock | ✓ | ✓ | — |
| Credit payments, customer limits | ✓ | ✓ | — |
| Reports + export | ✓ | ✓ | daily closing of own station |
| Settings, staff, reseed, backup | ✓ | — | — |

\* a staff row with `stationId = null` and role `manager` acts as network manager.

## 10. Backup / restore

- Export: all tables → single JSON (versioned envelope) → file download.
- Import: validate envelope with zod → wipe + restore inside one transaction.
