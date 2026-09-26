import { db } from "@/lib/db/dexie";
import type {
  BankDeposit,
  CreditTxn,
  Delivery,
  Dip,
  Expense,
  PaymentMethod,
  Reconciliation,
  Sale,
  SaleLine,
  Shift,
  ShiftName,
} from "@/lib/db/types";
import type { Role } from "@/lib/session/session-store";
import { balanceOf } from "@/lib/domain/aging";
import { receiptNo } from "@/lib/domain/format";
import { reconcile } from "@/lib/domain/variance";
import { syncAlerts } from "./alerts";
import { audit, DomainError, uid } from "./common";

export interface Actor {
  id: string;
  role: Role | null;
}

/* ------------------------------ shift lifecycle ------------------------ */

async function openShiftOf(stationId: string): Promise<Shift | undefined> {
  return db.shifts.where("stationId").equals(stationId).and((s) => s.status === "open").first();
}

export async function openShift(input: {
  stationId: string;
  staffId: string;
  name: ShiftName;
  openingCashPaise: number;
}): Promise<Shift> {
  if (await openShiftOf(input.stationId)) {
    throw new DomainError("This station already has an open shift. Close it first.");
  }
  const [closed, nozzles] = await Promise.all([
    db.shifts.where("stationId").equals(input.stationId).and((s) => s.status === "closed").toArray(),
    db.nozzles.where("stationId").equals(input.stationId).toArray(),
  ]);
  closed.sort((a, b) => b.openTs - a.openTs);
  const prev = closed[0];
  const shift: Shift = {
    id: uid("shf"),
    stationId: input.stationId,
    staffId: input.staffId,
    name: input.name,
    status: "open",
    openTs: Date.now(),
    openingCashPaise: input.openingCashPaise,
    openingTotalizers: prev?.closingTotalizers ?? Object.fromEntries(nozzles.map((n) => [n.id, n.totalizerMl])),
    updatedAt: Date.now(),
  };
  await db.shifts.add(shift);
  await audit(input.staffId, "shift.open", "shift", shift.id, `${input.name} shift opened`);
  return shift;
}

export async function closeShift(input: {
  shiftId: string;
  countedPaise: number;
  staffId: string;
  note?: string;
}): Promise<{ shift: Shift; recon: Reconciliation }> {
  const shift = await db.shifts.get(input.shiftId);
  if (!shift) throw new DomainError("Shift not found.");
  if (shift.status !== "open") throw new DomainError("Shift is already closed.");
  const station = await db.stations.get(shift.stationId);
  if (!station) throw new DomainError("Station not found.");

  const [sales, expenses, deposits, nozzles] = await Promise.all([
    db.sales.where("shiftId").equals(shift.id).toArray(),
    db.expenses.where("shiftId").equals(shift.id).toArray(),
    db.deposits.where("shiftId").equals(shift.id).toArray(),
    db.nozzles.where("stationId").equals(shift.stationId).toArray(),
  ]);
  const result = reconcile({
    openingCashPaise: shift.openingCashPaise,
    cashSalesPaise: sales.filter((s) => s.payment === "cash").reduce((a, s) => a + s.amountPaise, 0),
    cashExpensesPaise: expenses.filter((e) => e.paidBy === "cash").reduce((a, e) => a + e.amountPaise, 0),
    depositsPaise: deposits.reduce((a, d) => a + d.amountPaise, 0),
    countedPaise: input.countedPaise,
    tolerancePaise: station.tolerancePaise,
  });

  const ts = Date.now();
  const recon: Reconciliation = {
    id: uid("rec"),
    shiftId: shift.id,
    stationId: shift.stationId,
    ts,
    staffId: input.staffId,
    countedPaise: input.countedPaise,
    expectedPaise: result.expectedPaise,
    variancePaise: result.variancePaise,
    status: result.status,
    depositedPaise: input.countedPaise - result.variancePaise,
    note: input.note,
    updatedAt: ts,
  };
  const closed: Shift = {
    ...shift,
    status: "closed",
    closeTs: ts,
    closingTotalizers: Object.fromEntries(nozzles.map((n) => [n.id, n.totalizerMl])),
    updatedAt: ts,
  };

  await db.transaction("rw", db.shifts, db.reconciliations, async () => {
    await db.shifts.put(closed);
    await db.reconciliations.add(recon);
  });
  await audit(
    input.staffId,
    "shift.close",
    "shift",
    shift.id,
    `${shift.name} closed — ${result.status}, variance ${(result.variancePaise / 100).toFixed(0)} rupees`,
  );
  await syncAlerts();
  return { shift: closed, recon };
}

/* --------------------------------- sales -------------------------------- */

async function guardCredit(
  payment: PaymentMethod,
  customerId: string | undefined,
  amountPaise: number,
  actor: Actor,
): Promise<{ dueDays: number }> {
  if (payment !== "credit") return { dueDays: 0 };
  if (!customerId) throw new DomainError("Pick a customer for a credit sale.");
  const [account, txns] = await Promise.all([
    db.creditAccounts.where("customerId").equals(customerId).first(),
    db.creditTxns.where("customerId").equals(customerId).toArray(),
  ]);
  if (!account?.active) throw new DomainError("Customer has no active credit account.");
  const balance = balanceOf(txns);
  if (balance + amountPaise > account.creditLimitPaise && actor.role === "attendant") {
    throw new DomainError("Credit limit exceeded — a manager must approve this sale.");
  }
  return { dueDays: account.dueDays };
}

async function nextReceipt(): Promise<string> {
  const n = await db.sales.count();
  return receiptNo(n + 1);
}

export interface FuelSaleInput {
  stationId: string;
  staffId: string;
  role: Role | null;
  productCode: string;
  payment: PaymentMethod;
  customerId?: string;
  nozzleId?: string;
  litresMl?: number;
  amountPaise?: number;
}

export async function postFuelSale(input: FuelSaleInput): Promise<Sale> {
  const shift = await openShiftOf(input.stationId);
  if (!shift) throw new DomainError("No open shift at this station — start one from Shifts first.");
  const product = await db.products.where("code").equals(input.productCode).first();
  if (!product) throw new DomainError("Unknown fuel product.");

  let litresMl = input.litresMl ?? 0;
  let amountPaise = input.amountPaise ?? 0;
  if (!litresMl && amountPaise) litresMl = Math.round((amountPaise / product.unitPricePaise) * 1000);
  else if (!amountPaise && litresMl) amountPaise = Math.round((litresMl * product.unitPricePaise) / 1000);
  if (litresMl <= 0 || amountPaise <= 0) throw new DomainError("Enter litres or amount.");

  const { dueDays } = await guardCredit(input.payment, input.customerId, amountPaise, {
    id: input.staffId,
    role: input.role,
  });

  const ts = Date.now();
  const sale: Sale = {
    id: uid("sale"),
    stationId: input.stationId,
    shiftId: shift.id,
    ts,
    kind: "fuel",
    productCode: input.productCode,
    nozzleId: input.nozzleId,
    quantityMl: litresMl,
    unitPricePaise: product.unitPricePaise,
    amountPaise,
    payment: input.payment,
    customerId: input.payment === "credit" ? input.customerId : undefined,
    attendantId: input.staffId,
    receiptNo: await nextReceipt(),
    updatedAt: ts,
  };

  await db.transaction("rw", db.sales, db.nozzles, db.creditTxns, async () => {
    await db.sales.add(sale);
    if (input.nozzleId) {
      const nozzle = await db.nozzles.get(input.nozzleId);
      if (nozzle) {
        await db.nozzles.put({ ...nozzle, totalizerMl: nozzle.totalizerMl + litresMl, updatedAt: ts });
      }
    }
    if (sale.payment === "credit" && input.customerId) {
      const charge: CreditTxn = {
        id: uid("ctx"),
        customerId: input.customerId,
        ts,
        type: "charge",
        amountPaise,
        saleId: sale.id,
        dueTs: ts + dueDays * 86_400_000,
        method: "credit",
        staffId: input.staffId,
        updatedAt: ts,
      };
      await db.creditTxns.add(charge);
    }
  });

  await audit(input.staffId, "sale.fuel", "sale", sale.id, `${litresMl / 1000} L ${input.productCode}`);
  await syncAlerts();
  return sale;
}

export interface RetailSaleInput {
  stationId: string;
  staffId: string;
  role: Role | null;
  payment: PaymentMethod;
  customerId?: string;
  lines: { itemId: string; qty: number }[];
}

export async function postRetailSale(input: RetailSaleInput): Promise<Sale> {
  const shift = await openShiftOf(input.stationId);
  if (!shift) throw new DomainError("No open shift at this station — start one from Shifts first.");
  if (!input.lines.length) throw new DomainError("Cart is empty.");

  const items = await Promise.all(input.lines.map((l) => db.retailItems.get(l.itemId)));
  const lines: SaleLine[] = [];
  let amountPaise = 0;
  for (let i = 0; i < input.lines.length; i++) {
    const item = items[i];
    const qty = input.lines[i].qty;
    if (!item) throw new DomainError("Item not found.");
    if (qty <= 0) throw new DomainError(`Invalid quantity for ${item.name}.`);
    if (item.stockQty < qty) throw new DomainError(`Only ${item.stockQty} ${item.unit} of ${item.name} left.`);
    amountPaise += item.pricePaise * qty;
    lines.push({ itemId: item.id, sku: item.sku, name: item.name, qty, pricePaise: item.pricePaise });
  }

  const { dueDays } = await guardCredit(input.payment, input.customerId, amountPaise, {
    id: input.staffId,
    role: input.role,
  });

  const ts = Date.now();
  const sale: Sale = {
    id: uid("sale"),
    stationId: input.stationId,
    shiftId: shift.id,
    ts,
    kind: "retail",
    amountPaise,
    payment: input.payment,
    customerId: input.payment === "credit" ? input.customerId : undefined,
    attendantId: input.staffId,
    receiptNo: await nextReceipt(),
    lines,
    updatedAt: ts,
  };

  await db.transaction("rw", db.sales, db.retailItems, db.creditTxns, async () => {
    await db.sales.add(sale);
    for (let i = 0; i < input.lines.length; i++) {
      const item = items[i]!;
      await db.retailItems.put({ ...item, stockQty: item.stockQty - input.lines[i].qty, updatedAt: ts });
    }
    if (sale.payment === "credit" && input.customerId) {
      const charge: CreditTxn = {
        id: uid("ctx"),
        customerId: input.customerId,
        ts,
        type: "charge",
        amountPaise,
        saleId: sale.id,
        dueTs: ts + dueDays * 86_400_000,
        method: "credit",
        staffId: input.staffId,
        updatedAt: ts,
      };
      await db.creditTxns.add(charge);
    }
  });

  await audit(input.staffId, "sale.retail", "sale", sale.id, `${lines.length} item(s)`);
  await syncAlerts();
  return sale;
}

/* ------------------------------ stock & money --------------------------- */

export async function recordDip(input: {
  stationId: string;
  tankId: string;
  levelMl: number;
  staffId: string;
}): Promise<Dip> {
  const tank = await db.tanks.get(input.tankId);
  if (!tank || tank.stationId !== input.stationId) throw new DomainError("Tank not found at this station.");
  if (input.levelMl < 0 || input.levelMl > tank.capacityMl) {
    throw new DomainError("Dip must be between 0 and tank capacity.");
  }
  const ts = Date.now();
  const dip: Dip = {
    id: uid("dip"),
    stationId: input.stationId,
    tankId: input.tankId,
    ts,
    levelMl: input.levelMl,
    source: "manual",
    staffId: input.staffId,
    updatedAt: ts,
  };
  await db.dips.add(dip);
  await audit(input.staffId, "dip.record", "dip", dip.id, `${tank.name}: ${(input.levelMl / 1000).toFixed(1)} L`);
  await syncAlerts();
  return dip;
}

export async function recordDelivery(input: {
  stationId: string;
  tankId: string;
  invoiceNo: string;
  supplier: string;
  volumeMl: number;
  ratePaise: number;
  staffId: string;
}): Promise<Delivery> {
  const tank = await db.tanks.get(input.tankId);
  if (!tank || tank.stationId !== input.stationId) throw new DomainError("Tank not found at this station.");
  if (input.volumeMl <= 0) throw new DomainError("Volume must be positive.");
  const ts = Date.now();
  const delivery: Delivery = {
    id: uid("dlv"),
    stationId: input.stationId,
    tankId: input.tankId,
    productCode: tank.productCode,
    ts,
    invoiceNo: input.invoiceNo || `INV-${ts.toString().slice(-6)}`,
    supplier: input.supplier || "Hindustan Petroleum",
    volumeMl: input.volumeMl,
    ratePaise: input.ratePaise,
    amountPaise: Math.round((input.volumeMl * input.ratePaise) / 1000),
    staffId: input.staffId,
    updatedAt: ts,
  };
  await db.deliveries.add(delivery);
  await audit(input.staffId, "delivery.record", "delivery", delivery.id, `${tank.name}: ${input.volumeMl / 1000} L`);
  await syncAlerts();
  return delivery;
}

export async function addExpense(input: {
  stationId: string;
  category: Expense["category"];
  amountPaise: number;
  paidBy: Expense["paidBy"];
  note: string;
  staffId: string;
  shiftId?: string;
}): Promise<Expense> {
  if (input.amountPaise <= 0) throw new DomainError("Amount must be positive.");
  const ts = Date.now();
  const count = await db.expenses.count();
  const row: Expense = {
    id: uid("exp"),
    stationId: input.stationId,
    ts,
    category: input.category,
    amountPaise: input.amountPaise,
    paidBy: input.paidBy,
    voucherNo: `V-${String(count + 1).padStart(5, "0")}`,
    shiftId: input.shiftId,
    note: input.note,
    staffId: input.staffId,
    updatedAt: ts,
  };
  await db.expenses.add(row);
  await audit(input.staffId, "expense.add", "expense", row.id, `${row.voucherNo} — ${input.note}`);
  return row;
}

export async function addDeposit(input: {
  stationId: string;
  amountPaise: number;
  refNo: string;
  staffId: string;
  shiftId?: string;
}): Promise<BankDeposit> {
  if (input.amountPaise <= 0) throw new DomainError("Amount must be positive.");
  const ts = Date.now();
  const row: BankDeposit = {
    id: uid("dep"),
    stationId: input.stationId,
    ts,
    amountPaise: input.amountPaise,
    refNo: input.refNo || `NEFT-${ts.toString().slice(-6)}`,
    shiftId: input.shiftId,
    staffId: input.staffId,
    updatedAt: ts,
  };
  await db.deposits.add(row);
  await audit(input.staffId, "deposit.add", "deposit", row.id, `${row.refNo} — ${input.amountPaise / 100} rupees`);
  return row;
}

/* --------------------------------- credit -------------------------------- */

export async function recordPayment(input: {
  customerId: string;
  amountPaise: number;
  method: "cash" | "bank";
  staffId: string;
  note?: string;
}): Promise<CreditTxn> {
  if (input.amountPaise <= 0) throw new DomainError("Payment must be positive.");
  const txns = await db.creditTxns.where("customerId").equals(input.customerId).toArray();
  const balance = balanceOf(txns);
  if (input.amountPaise > balance) throw new DomainError("Payment exceeds the outstanding balance.");
  const ts = Date.now();
  const txn: CreditTxn = {
    id: uid("ctx"),
    customerId: input.customerId,
    ts,
    type: "payment",
    amountPaise: input.amountPaise,
    method: input.method,
    note: input.note,
    staffId: input.staffId,
    updatedAt: ts,
  };
  await db.creditTxns.add(txn);
  await audit(input.staffId, "credit.payment", "customer", input.customerId, `${input.amountPaise / 100} rupees received`);
  await syncAlerts();
  return txn;
}

export async function adjustCredit(input: {
  customerId: string;
  amountPaise: number;
  staffId: string;
  note: string;
}): Promise<CreditTxn> {
  if (!input.note) throw new DomainError("Adjustment needs a note.");
  const ts = Date.now();
  const txn: CreditTxn = {
    id: uid("ctx"),
    customerId: input.customerId,
    ts,
    type: "adjustment",
    amountPaise: input.amountPaise,
    method: "cash",
    note: input.note,
    staffId: input.staffId,
    updatedAt: ts,
  };
  await db.creditTxns.add(txn);
  await audit(input.staffId, "credit.adjust", "customer", input.customerId, input.note);
  await syncAlerts();
  return txn;
}

export async function updateCreditLimit(input: {
  customerId: string;
  creditLimitPaise: number;
  dueDays: number;
  staffId: string;
}): Promise<void> {
  const account = await db.creditAccounts.where("customerId").equals(input.customerId).first();
  if (!account) throw new DomainError("No credit account for this customer.");
  await db.creditAccounts.put({
    ...account,
    creditLimitPaise: input.creditLimitPaise,
    dueDays: input.dueDays,
    updatedAt: Date.now(),
  });
  await audit(
    input.staffId,
    "credit.limit",
    "customer",
    input.customerId,
    `Limit set to ${input.creditLimitPaise / 100} rupees`,
  );
  await syncAlerts();
}

/* ------------------------------ price / retail --------------------------- */

export async function setFuelPrice(input: {
  productCode: string;
  unitPricePaise: number;
  staffId: string;
}): Promise<void> {
  const product = await db.products.where("code").equals(input.productCode).first();
  if (!product) throw new DomainError("Unknown product.");
  if (input.unitPricePaise <= 0) throw new DomainError("Price must be positive.");
  const ts = Date.now();
  await db.products.put({
    ...product,
    unitPricePaise: input.unitPricePaise,
    priceHistory: [...product.priceHistory, { ts, unitPricePaise: input.unitPricePaise }],
    updatedAt: ts,
  });
  await audit(input.staffId, "price.set", "product", product.id, `${input.productCode} → ${input.unitPricePaise / 100} /L`);
  await syncAlerts();
}

export async function adjustRetailStock(input: {
  itemId: string;
  delta: number;
  staffId: string;
}): Promise<void> {
  const item = await db.retailItems.get(input.itemId);
  if (!item) throw new DomainError("Item not found.");
  const next = item.stockQty + input.delta;
  if (next < 0) throw new DomainError("Stock cannot go below zero.");
  await db.retailItems.put({ ...item, stockQty: next, updatedAt: Date.now() });
  await audit(input.staffId, "stock.adjust", "retailItem", item.id, `${item.name} ${input.delta > 0 ? "+" : ""}${input.delta}`);
  await syncAlerts();
}
