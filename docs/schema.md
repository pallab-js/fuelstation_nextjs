# Backend Schema (local-first: Dexie / IndexedDB)

Conventions: ids are prefixed strings (`st_`, `sf_`, `sl_`…), **money = integer paise
(`…Paise`)**, **volume = integer millilitres (`…Ml`)**, timestamps = epoch ms (`ts`).
Every table row extends `Base { id, updatedAt }`. Dexie indexes shown in `code`.

## Entity-relationship (logical)

```
Staff ──< Shift ──< Sale >── FuelProduct ──< Tank ──< DipReading
  │         │         │                          ▲
  │         ▼         ▼                          │
  │   Reconciliation  PaymentMethod        Delivery
  │
Station ──< Pump ──< Nozzle            Tank(station, product)
  │
  ├──< Expense            ├──< BankDeposit
  ├──< RetailItem ──< RetailLine (inside Sale)
  └──< Alert

Customer ──< CreditAccount ──< Vehicle
    └──────< CreditTxn (charge | payment | adjustment)
```

## Tables & indexes (Dexie `version(1).stores`)

### `stations` — `id, code, name, city, status`
| field | type | notes |
|---|---|---|
| code | string | short display code e.g. `HO-01` |
| name, city, address | string | |
| timezone | string | default `Asia/Kolkata` |
| tolerancePaise | number | allowed cash variance per shift close |
| status | `'active' \| 'inactive'` | |
| openSince | number | |

### `staff` — `id, name, role, stationId, active`
| role | scope |
|---|---|
| `owner` | all stations, all actions, settings |
| `manager` | its `stationId` (or all if network manager), ops + reports |
| `attendant` | its `stationId`, POS + own shift only |

`pinSalt`, `pinHash` (PBKDF2-SHA256 100k iters, WebCrypto), `phone`.

### `fuelProducts` — `id, code, name`
`unitPricePaise`, `priceHistory: {ts, unitPricePaise}[]`, `color` (chart series),
`densityGmL` (for dip→litre display). Codes: `PETROL`, `DIESEL`, `PREMIUM`.

### `pumps` — `id, stationId, name, status` — e.g. "Pump 1"
### `nozzles` — `id, pumpId, stationId, nozzleNo, productCode, status`
`totalizerMl` (lifetime meter, updated by sales) — index `stationId`.

### `tanks` — `id, stationId, productCode, name`
`capacityMl`, `safeLevelPct`, `criticalLevelPct`, `installLevelMl`.
Indexes: `stationId`, `productCode`.

### `dips` — `id, stationId, tankId, ts, levelMl, source, staffId`
`source: 'manual' | 'auto'` · index `[tankId+ts]`, `stationId`.

### `deliveries` — `id, stationId, tankId, productCode, ts`
`invoiceNo`, `supplier`, `volumeMl`, `ratePaise`, `amountPaise`, `staffId`.

### `shifts` — `id, stationId, staffId, name, status`
`name: 'Morning' | 'Evening' | 'Night'` · `status: 'open' | 'closed'` ·
`openTs`, `closeTs?`, `openingCashPaise`, `openingTotalizers: Record<nozzleId, ml>`.
Indexes: `stationId`, `status`, `[stationId+openTs]`.

### `sales` — `id, stationId, shiftId, ts, kind`
| field | type | notes |
|---|---|---|
| kind | `'fuel' \| 'retail'` | |
| productCode | string? | fuel sales |
| nozzleId | string? | fuel sales |
| quantityMl | number? | fuel: litres dispensed |
| unitPricePaise | number? | price at time of sale (price history snapshot) |
| amountPaise | number | gross line amount |
| payment | `'cash' \| 'upi' \| 'card' \| 'credit'` | |
| customerId | string? | when payment = credit |
| attendantId | string | |
| receiptNo | string | human-friendly running no. |
| lines | `{itemId, qty, pricePaise}[]`? | retail cart contents |
Indexes: `[stationId+ts]`, `shiftId`, `payment`, `kind`, `customerId`.

### `reconciliations` — `id, shiftId, stationId, ts, staffId`
`countedPaise`, `expectedPaise`, `variancePaise`, `status: 'ok' | 'short' | 'over'`,
`depositedPaise`, `note`.

### `customers` — `id, code, name, phone, kind: 'fleet' | 'credit'`
### `creditAccounts` — `id, customerId, creditLimitPaise, dueDays, active`
### `vehicles` — `id, customerId, regNo, productCode, monthlyLimitMl, active`
### `creditTxns` — `id, customerId, ts, type: 'charge' | 'payment' | 'adjustment'`
`amountPaise` (positive = owes), `saleId?`, `dueTs?`, `method`, `note`, `staffId`.
Indexes: `customerId`, `ts`.

### `expenses` — `id, stationId, ts, category, amountPaise`
`category: 'petty' | 'maintenance' | 'utilities' | 'salary' | 'supplies' | 'other'` ·
`paidBy: 'cash' | 'bank'`, `voucherNo`, `shiftId?`, `note`, `staffId`.

### `deposits` — `id, stationId, ts, amountPaise, refNo, shiftId?`, `staffId`
(bank deposits — reduce station cash in hand)

### `retailItems` — `id, stationId?, sku, name, category`
`pricePaise`, `costPaise`, `stockQty`, `lowStockAt`, `unit` (`pcs`/`L`/`kg`).
`stationId = null` → shared template; stock is per-station row.

### `alerts` — `id, severity, type, stationId?, ts, title, message, acked, link?`
`severity: 'info' | 'warning' | 'critical'` ·
`type: 'low-stock' | 'critical-stock' | 'wet-stock-variance' | 'cash-short' |
       'credit-limit' | 'credit-overdue' | 'shift-open-long' | 'low-retail-stock'`.
Indexes: `ts`, `acked`, `stationId`.

### `auditLog` — `id, ts, staffId, action, entity, entityId, summary`
(append-only; `before/after` JSON kept small)

### `settings` — `key` (pk), `value`
Keys: `seedVersion`, `currency`, `defaultTolerancePaise`, `activeProfileId`,
`hourFormat`, `demoHints`.

## Derived (never stored)

- Tank current level = latest dip + deliveries since − fuel sold since (per tank).
- Shift totals / cash expected = sum of in-shift sales, expenses, deposits.
- Aging buckets = sum of unpaid `creditTxn` charges past due dates.
- All dashboard KPIs = selectors over `sales`/`dips`/`creditTxns`.
