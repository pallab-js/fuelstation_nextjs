import { db } from "@/lib/db/dexie";
import type { EntityTable } from "dexie";
import type {
  Alert,
  BankDeposit,
  Nozzle,
  Pump,
  Staff,
  Tank,
  CreditAccount,
  CreditTxn,
  Customer,
  Delivery,
  Dip,
  Expense,
  FuelProduct,
  Reconciliation,
  RetailItem,
  Sale,
  Shift,
  Station,
} from "@/lib/db/types";
import { agingOf, balanceOf, oldestDueTs, type Aging } from "@/lib/domain/aging";
import {
  collectionsMix,
  filterRange,
  hourlyPattern,
  kpis,
  leaderboard,
  productMix,
  trend,
  varianceByStation,
  type DayPoint,
  type KpiSet,
  type StationRow,
} from "@/lib/domain/analytics";
import { addDays, isLongOpen, rangeFor, startOfDay, type RangePreset } from "@/lib/domain/dates";
import { computeTankStats, type TankStat } from "@/lib/domain/tanks";
import { scopeMatches, type Scope } from "@/lib/session/session-store";
import { expectedCashPaise } from "@/lib/domain/variance";

/* ------------------------------- helpers ------------------------------- */

/*
 * Scope-aware loaders. Invariant: for any single-station scope `s`, the rows
 * returned here MUST equal `loadAll().filter(r => scopeMatches(r.stationId, s))`
 * — same result set, but read through the `[stationId+ts]` / `stationId`
 * indexes instead of pulling every station's rows into memory and filtering in
 * JS. The "all" scope keeps the original range-index path unchanged.
 */

/**
 * Return the concrete station ids a scope resolves to, or `null` for the
 * network-wide ("all") scope. Lets callers choose an index-backed query for a
 * single station instead of loading every station's rows and filtering in JS.
 */
async function scopeStationIds(scope: Scope): Promise<string[] | null> {
  if (scope === "all") return null;
  return [scope];
}

/**
 * Sales within [from,to] for a scope. Uses the `[stationId+ts]` compound index
 * when scoped to a single station, falling back to the `ts` range index for the
 * network-wide scope. Avoids pulling every station's sales into memory.
 */
async function salesInRange(scope: Scope, from: number, to: number): Promise<Sale[]> {
  const ids = await scopeStationIds(scope);
  if (!ids) return db.sales.where("ts").between(from, to, true, true).toArray();
  const perStation = await Promise.all(
    ids.map((id) =>
      db.sales.where("[stationId+ts]").between([id, from], [id, to], true, true).toArray(),
    ),
  );
  return perStation.flat();
}

/** Shifts for a scope, using the `stationId` index when scoped to one station. */
async function shiftsForScope(scope: Scope): Promise<Shift[]> {
  const ids = await scopeStationIds(scope);
  if (!ids) return db.shifts.toArray();
  const per = await Promise.all(ids.map((id) => db.shifts.where("stationId").equals(id).toArray()));
  return per.flat();
}

/** Stations for a scope, using a point-get when scoped to one station. */
async function stationsForScope(scope: Scope): Promise<Station[]> {
  const ids = await scopeStationIds(scope);
  if (!ids) return db.stations.toArray();
  const per = await Promise.all(ids.map((id) => db.stations.get(id)));
  return per.filter((s): s is Station => s !== undefined);
}

/** Rows carrying a `stationId`, loaded via that index when scoped to one station. */
async function byStation<T extends { id: string; stationId: string }>(
  table: EntityTable<T, "id">,
  scope: Scope,
): Promise<T[]> {
  const ids = await scopeStationIds(scope);
  if (!ids) return table.toArray();
  const per = await Promise.all(ids.map((id) => table.where("stationId").equals(id).toArray()));
  return per.flat();
}

export interface ScopedRows {
  stations: Station[];
  sales: Sale[];
  shifts: Shift[];
  recons: Reconciliation[];
  expenses: Expense[];
  deposits: BankDeposit[];
}

/** Load the station-scoped operational rows for a scope + range. */
export async function loadScopedRows(scope: Scope, range: { from: number; to: number }): Promise<ScopedRows> {
  const inRange = (r: { ts: number }) => r.ts >= range.from && r.ts <= range.to;
  const [stations, sales, shifts, recons, expenses, deposits] = await Promise.all([
    stationsForScope(scope),
    salesInRange(scope, range.from, range.to),
    shiftsForScope(scope),
    scope === "all"
      ? db.reconciliations.where("ts").between(range.from, range.to, true, true).toArray()
      : byStation(db.reconciliations, scope).then((rows) => rows.filter(inRange)),
    scope === "all"
      ? db.expenses.where("ts").between(range.from, range.to, true, true).toArray()
      : byStation(db.expenses, scope).then((rows) => rows.filter(inRange)),
    scope === "all"
      ? db.deposits.where("ts").between(range.from, range.to, true, true).toArray()
      : byStation(db.deposits, scope).then((rows) => rows.filter(inRange)),
  ]);
  return {
    stations: stations.filter((s) => s.status === "active"),
    sales,
    shifts: shifts.filter((r) => scopeMatches(r.stationId, scope)),
    recons,
    expenses,
    deposits,
  };
}

/* ------------------------------- dashboard ----------------------------- */

export interface DashboardData {
  now: number;
  scope: Scope;
  preset: RangePreset;
  range: { from: number; to: number };
  stations: Station[];
  kpisNow: KpiSet;
  kpisPrev: KpiSet;
  trend: DayPoint[];
  mix: ReturnType<typeof collectionsMix>;
  productMix: { code: string; litresMl: number; revenuePaise: number }[];
  hourly: number[];
  leaderboard: StationRow[];
  tankStats: TankStat[];
  openShifts: Shift[];
  longOpenShifts: number;
  alerts: Alert[];
  expensesPaise: number;
  variancePaise: number;
  creditOutstandingPaise: number;
  creditOverduePaise: number;
  recentRecons: Reconciliation[];
  lowRetail: RetailItem[];
}

export async function queryDashboard(
  scope: Scope,
  preset: RangePreset = "7d",
  now = Date.now(),
): Promise<DashboardData> {
  const range = rangeFor(preset, now);
  const span = range.to - range.from;
  const prev = { from: range.from - span, to: range.from };
  const trendFrom = startOfDay(range.from);

  const [
    stationsAll,
    sales,
    shiftsAll,
    tanks,
    dips,
    deliveries,
    alertsAll,
    expenses,
    recons,
    retailItems,
    customers,
    creditTxns,
  ] = await Promise.all([
    stationsForScope(scope),
    salesInRange(scope, prev.from, range.to),
    shiftsForScope(scope),
    byStation(db.tanks, scope),
    db.dips.toArray(),
    db.deliveries.toArray(),
    db.alerts.toArray(),
    scope === "all"
      ? db.expenses.where("ts").between(range.from, range.to, true, true).toArray()
      : byStation(db.expenses, scope).then((rows) => rows.filter((e) => e.ts >= range.from && e.ts <= range.to)),
    scope === "all"
      ? db.reconciliations.where("ts").between(range.from, range.to, true, true).toArray()
      : byStation(db.reconciliations, scope).then((rows) => rows.filter((r) => r.ts >= range.from && r.ts <= range.to)),
    db.retailItems.toArray(),
    db.customers.toArray(),
    db.creditTxns.toArray(),
  ]);

  const inScope = (stationId: string) => scopeMatches(stationId, scope);
  const stations = stationsAll;
  const scopeSales = sales.filter((s) => inScope(s.stationId));
  const nowSales = scopeSales.filter((s) => s.ts >= range.from);
  const prevSales = scopeSales.filter((s) => s.ts >= prev.from && s.ts < range.from);
  const openShifts = shiftsAll.filter((sh) => sh.status === "open" && inScope(sh.stationId));

  const scopedCustomers = new Set(customers.map((c) => c.id));
  let creditOutstandingPaise = 0;
  let creditOverduePaise = 0;
  for (const t of creditTxns) {
    if (!scopedCustomers.has(t.customerId)) continue;
    const sgn = t.type === "payment" ? -1 : 1;
    creditOutstandingPaise += sgn * t.amountPaise;
    if (t.type === "charge" && t.dueTs && t.dueTs < now) creditOverduePaise += t.amountPaise;
  }

  return {
    now,
    scope,
    preset,
    range,
    stations,
    kpisNow: kpis(nowSales),
    kpisPrev: kpis(prevSales),
    trend: trend(
      nowSales,
      trendFrom,
      preset === "today" ? range.to : Math.min(range.to, startOfDay(now) - 1),
    ),
    mix: collectionsMix(nowSales),
    productMix: productMix(nowSales),
    hourly: hourlyPattern(nowSales),
    leaderboard: leaderboard(
      stations.filter((s) => s.status === "active"),
      nowSales,
      varianceByStation(recons),
    ),
    tankStats: computeTankStats({
      stations,
      tanks: tanks.filter((t) => inScope(t.stationId)),
      dips,
      deliveries,
      sales: nowSales,
      now,
    }),
    openShifts,
    longOpenShifts: openShifts.filter((sh) => isLongOpen(sh.openTs, now)).length,
    alerts: alertsAll
      .filter((a) => a.stationId === null || inScope(a.stationId))
      .sort((a, b) => Number(a.acked) - Number(b.acked) || b.ts - a.ts),
    expensesPaise: expenses.reduce((a, e) => a + e.amountPaise, 0),
    variancePaise: recons.reduce((a, r) => a + r.variancePaise, 0),
    creditOutstandingPaise,
    creditOverduePaise,
    recentRecons: [...recons].sort((a, b) => b.ts - a.ts).slice(0, 8),
    lowRetail: retailItems.filter(
      (r) => scopeMatches(r.stationId, scope) && r.stockQty <= r.lowStockAt,
    ),
  };
}

/* --------------------------------- shifts ------------------------------ */

export interface ShiftRow {
  shift: Shift;
  station?: Station;
  staffName: string;
  salesPaise: number;
  salesCount: number;
  cashPaise: number;
  expensesCashPaise: number;
  depositsPaise: number;
  runningCashPaise: number;
  recon?: Reconciliation;
}

export async function queryShifts(scope: Scope, limit = 60): Promise<ShiftRow[]> {
  const [shifts, sales, recons, stations, staff, expenses, deposits] = await Promise.all([
    db.shifts.orderBy("openTs").reverse().limit(limit).toArray(),
    db.sales.toArray(),
    db.reconciliations.toArray(),
    db.stations.toArray(),
    db.staff.toArray(),
    db.expenses.toArray(),
    db.deposits.toArray(),
  ]);
  const reconByShift = new Map(recons.map((r) => [r.shiftId, r]));
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const stationById = new Map(stations.map((s) => [s.id, s]));

  return shifts
    .filter((sh) => scopeMatches(sh.stationId, scope))
    .map((shift) => {
      const rows = sales.filter((s) => s.shiftId === shift.id);
      const cashPaise = rows.filter((s) => s.payment === "cash").reduce((a, s) => a + s.amountPaise, 0);
      const expensesCashPaise = expenses
        .filter((e) => e.shiftId === shift.id && e.paidBy === "cash")
        .reduce((a, e) => a + e.amountPaise, 0);
      const depositsPaise = deposits.filter((d) => d.shiftId === shift.id).reduce((a, d) => a + d.amountPaise, 0);
      return {
        shift,
        station: stationById.get(shift.stationId),
        staffName: nameOf.get(shift.staffId) ?? shift.staffId,
        salesPaise: rows.reduce((a, s) => a + s.amountPaise, 0),
        salesCount: rows.length,
        cashPaise,
        expensesCashPaise,
        depositsPaise,
        runningCashPaise: shift.openingCashPaise + cashPaise - expensesCashPaise - depositsPaise,
        recon: reconByShift.get(shift.id),
      };
    });
}

/** In-shift sales ledger rows. */
export interface ShiftSaleRow {
  id: string;
  ts: number;
  receiptNo: string;
  kind: string;
  detail: string;
  amountPaise: number;
  payment: string;
}

export async function queryShiftSales(shiftId: string): Promise<ShiftSaleRow[]> {
  const rows = await db.sales.where("shiftId").equals(shiftId).sortBy("ts");
  return rows.map((s) => ({
    id: s.id,
    ts: s.ts,
    receiptNo: s.receiptNo,
    kind: s.kind,
    detail:
      s.kind === "fuel"
        ? `${s.productCode} · ${litresFmt(s.quantityMl ?? 0)}`
        : `${s.lines?.length ?? 0} item(s)`,
    amountPaise: s.amountPaise,
    payment: s.payment,
  }));
}

function litresFmt(ml: number): string {
  return `${(ml / 1000).toFixed(2)} L`;
}

export async function shiftExpectedCash(shift: Shift): Promise<number> {
  const [sales, expenses, deposits] = await Promise.all([
    db.sales.where("shiftId").equals(shift.id).toArray(),
    db.expenses.where("shiftId").equals(shift.id).toArray(),
    db.deposits.where("shiftId").equals(shift.id).toArray(),
  ]);
  return expectedCashPaise({
    openingCashPaise: shift.openingCashPaise,
    cashSalesPaise: sales.filter((s) => s.payment === "cash").reduce((a, s) => a + s.amountPaise, 0),
    cashExpensesPaise: expenses.filter((e) => e.paidBy === "cash").reduce((a, e) => a + e.amountPaise, 0),
    depositsPaise: deposits.reduce((a, d) => a + d.amountPaise, 0),
  });
}

/* --------------------------------- credit ------------------------------ */

export interface CreditRow {
  customer: Customer;
  account?: CreditAccount;
  balancePaise: number;
  limitPaise: number;
  aging: Aging;
  oldestDueTs: number | null;
  txnCount: number;
}

export async function queryCredit(): Promise<CreditRow[]> {
  const [customers, accounts, txns] = await Promise.all([
    db.customers.toArray(),
    db.creditAccounts.toArray(),
    db.creditTxns.orderBy("ts").toArray(),
  ]);
  const accountOf = new Map(accounts.map((a) => [a.customerId, a]));
  return customers.map((customer) => {
    const own = txns.filter((t) => t.customerId === customer.id);
    const account = accountOf.get(customer.id);
    return {
      customer,
      account,
      balancePaise: balanceOf(own),
      limitPaise: account?.creditLimitPaise ?? 0,
      aging: agingOf(own),
      oldestDueTs: oldestDueTs(own),
      txnCount: own.length,
    };
  });
}

export async function queryCustomerLedger(customerId: string): Promise<CreditTxn[]> {
  const rows = await db.creditTxns.where("customerId").equals(customerId).sortBy("ts");
  return rows.reverse();
}

/* ------------------------------- inventory ----------------------------- */

export interface InventoryData {
  tankStats: TankStat[];
  recentDips: (Dip & { tankName: string })[];
  recentDeliveries: (Delivery & { tankName: string })[];
  retailItems: RetailItem[];
  products: FuelProduct[];
}

export async function queryInventory(scope: Scope, now = Date.now()): Promise<InventoryData> {
  const from = addDays(now, -30);
  const [stations, tanks, dips, deliveries, sales30, items, products] = await Promise.all([
    stationsForScope(scope),
    byStation(db.tanks, scope),
    db.dips.where("ts").between(from, now, true, true).reverse().toArray(),
    db.deliveries.where("ts").between(from, now, true, true).reverse().toArray(),
    salesInRange(scope, from, now),
    byStation(db.retailItems, scope),
    db.products.toArray(),
  ]);
  const inScope = (stationId: string) => scopeMatches(stationId, scope);
  const scopedTanks = tanks;
  const tankName = new Map(scopedTanks.map((t) => [t.id, t.name]));

  return {
    tankStats: computeTankStats({
      stations,
      tanks: scopedTanks,
      dips: dips.filter((d) => inScope(d.stationId)),
      deliveries: deliveries.filter((d) => inScope(d.stationId)),
      sales: sales30.filter((s) => inScope(s.stationId)),
      now,
    }),
    recentDips: dips.filter((d) => inScope(d.stationId)).map((d) => ({ ...d, tankName: tankName.get(d.tankId) ?? d.tankId })),
    recentDeliveries: deliveries
      .filter((d) => inScope(d.stationId))
      .map((d) => ({ ...d, tankName: tankName.get(d.tankId) ?? d.tankId })),
    retailItems: items.filter((i) => inScope(i.stationId)),
    products,
  };
}

/* --------------------------------- POS --------------------------------- */

export interface PosContext {
  station?: Station;
  openShift?: Shift;
  products: FuelProduct[];
  items: RetailItem[];
  customers: Customer[];
  accounts: CreditAccount[];
  txns: CreditTxn[];
  nozzles: Nozzle[];
}

export async function queryPos(stationId: string): Promise<PosContext> {
  const [stations, shifts, products, items, customers, accounts, txns, nozzles] = await Promise.all([
    db.stations.get(stationId),
    db.shifts.where("stationId").equals(stationId).toArray(),
    db.products.toArray(),
    db.retailItems.where("stationId").equals(stationId).toArray(),
    db.customers.toArray(),
    db.creditAccounts.toArray(),
    db.creditTxns.toArray(),
    db.nozzles.where("stationId").equals(stationId).toArray(),
  ]);
  return {
    station: stations,
    openShift: shifts.find((s) => s.status === "open"),
    products,
    items,
    customers,
    accounts,
    txns,
    nozzles,
  };
}

/* ------------------------- station detail / cards ---------------------- */

export interface StationCard {
  station: Station;
  todayPaise: number;
  todayLitresMl: number;
  todaySalesCount: number;
  openShift?: Shift;
  tankStats: TankStat[];
  staffCount: number;
}

export async function queryStationCards(scope: Scope, now = Date.now()): Promise<StationCard[]> {
  const dayStart = startOfDay(now);
  const [stations, sales, shifts, tanks, dips, deliveries, staff] = await Promise.all([
    stationsForScope(scope),
    salesInRange(scope, dayStart, now),
    shiftsForScope(scope),
    byStation(db.tanks, scope),
    db.dips.toArray(),
    db.deliveries.toArray(),
    db.staff.toArray(),
  ]);
  const visible = stations;
  return visible.map((station) => {
    const rows = sales.filter((s) => s.stationId === station.id);
    const stTanks = tanks.filter((t) => t.stationId === station.id);
    return {
      station,
      todayPaise: rows.reduce((a, s) => a + s.amountPaise, 0),
      todayLitresMl: rows.reduce((a, s) => a + (s.kind === "fuel" ? (s.quantityMl ?? 0) : 0), 0),
      todaySalesCount: rows.length,
      openShift: shifts.find((sh) => sh.stationId === station.id && sh.status === "open"),
      tankStats: computeTankStats({
        stations: [station],
        tanks: stTanks,
        dips,
        deliveries,
        sales,
        now,
      }),
      staffCount: staff.filter((m) => m.stationId === station.id && m.active).length,
    };
  });
}

/* ------------------------------- reports ------------------------------- */

export interface ReportInput {
  sales: Sale[];
  expenses: Expense[];
  deposits: BankDeposit[];
  recons: Reconciliation[];
  stations: Station[];
  range: { from: number; to: number };
}

export async function queryReport(scope: Scope, preset: RangePreset): Promise<ReportInput> {
  const range = rangeFor(preset);
  const rows = await loadScopedRows(scope, range);
  return { ...rows, range };
}

export function rangeDays(preset: RangePreset, now = Date.now()): number {
  return Math.round((now - rangeFor(preset, now).from) / 86_400_000) || 1;
}

/** Rows filtered to a range (re-export for pages). */
export { filterRange };

/* ---------------------------- station detail --------------------------- */

export interface StationDetailData {
  station?: Station;
  tanks: Tank[];
  tankStats: TankStat[];
  pumps: Pump[];
  nozzles: Nozzle[];
  staff: Staff[];
  openShift?: Shift;
  todaySales: Sale[];
  recentRecons: Reconciliation[];
  todayPaise: number;
  todayLitresMl: number;
}

export async function queryStationDetail(stationId: string, now = Date.now()): Promise<StationDetailData> {
  const dayStart = startOfDay(now);
  const [
    station,
    tanks,
    pumps,
    nozzles,
    staff,
    shifts,
    sales,
    recons,
    dips,
    deliveries,
  ] = await Promise.all([
    db.stations.get(stationId),
    db.tanks.where("stationId").equals(stationId).toArray(),
    db.pumps.where("stationId").equals(stationId).toArray(),
    db.nozzles.where("stationId").equals(stationId).toArray(),
    db.staff.where("stationId").equals(stationId).and((s) => s.active).toArray(),
    db.shifts.where("stationId").equals(stationId).toArray(),
    db.sales.where("ts").between(dayStart, now, true, true).toArray(),
    db.reconciliations.where("stationId").equals(stationId).toArray(),
    db.dips.toArray(),
    db.deliveries.toArray(),
  ]);
  const stations = station ? [station] : [];
  const today = sales.filter((s) => s.stationId === stationId);
  return {
    station,
    tanks,
    tankStats: computeTankStats({
      stations,
      tanks,
      dips: dips.filter((d) => d.stationId === stationId),
      deliveries: deliveries.filter((d) => d.stationId === stationId),
      sales: today,
      now,
    }),
    pumps,
    nozzles,
    staff,
    openShift: shifts.find((s) => s.status === "open"),
    todaySales: today,
    recentRecons: recons
      .filter((r) => r.stationId === stationId)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 10),
    todayPaise: today.reduce((a, s) => a + s.amountPaise, 0),
    todayLitresMl: today.reduce((a, s) => a + (s.kind === "fuel" ? (s.quantityMl ?? 0) : 0), 0),
  };
}
