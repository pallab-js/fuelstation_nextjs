import Dexie, { type EntityTable } from "dexie";
import type {
  Alert,
  AuditEntry,
  BankDeposit,
  CreditAccount,
  CreditTxn,
  Customer,
  Delivery,
  Dip,
  Expense,
  FuelProduct,
  Nozzle,
  Pump,
  Reconciliation,
  RetailItem,
  Sale,
  SettingRow,
  Shift,
  Staff,
  Station,
  Tank,
  Vehicle,
} from "./types";

class FuelOpsDB extends Dexie {
  stations!: EntityTable<Station, "id">;
  staff!: EntityTable<Staff, "id">;
  products!: EntityTable<FuelProduct, "id">;
  pumps!: EntityTable<Pump, "id">;
  nozzles!: EntityTable<Nozzle, "id">;
  tanks!: EntityTable<Tank, "id">;
  dips!: EntityTable<Dip, "id">;
  deliveries!: EntityTable<Delivery, "id">;
  shifts!: EntityTable<Shift, "id">;
  sales!: EntityTable<Sale, "id">;
  reconciliations!: EntityTable<Reconciliation, "id">;
  customers!: EntityTable<Customer, "id">;
  creditAccounts!: EntityTable<CreditAccount, "id">;
  vehicles!: EntityTable<Vehicle, "id">;
  creditTxns!: EntityTable<CreditTxn, "id">;
  expenses!: EntityTable<Expense, "id">;
  deposits!: EntityTable<BankDeposit, "id">;
  retailItems!: EntityTable<RetailItem, "id">;
  alerts!: EntityTable<Alert, "id">;
  auditLog!: EntityTable<AuditEntry, "id">;
  settings!: EntityTable<SettingRow, "key">;

  constructor() {
    super("fuelops");
    this.version(1).stores({
      stations: "id, code, name, status",
      staff: "id, name, role, stationId",
      products: "id, code, name",
      pumps: "id, stationId, name",
      nozzles: "id, pumpId, stationId, productCode",
      tanks: "id, stationId, productCode",
      dips: "id, stationId, tankId, ts, [tankId+ts]",
      deliveries: "id, stationId, tankId, ts",
      shifts: "id, stationId, staffId, status, openTs, [stationId+openTs]",
      sales: "id, stationId, shiftId, ts, kind, payment, customerId, [stationId+ts], [shiftId+ts]",
      reconciliations: "id, shiftId, stationId, ts",
      customers: "id, code, name, kind",
      creditAccounts: "id, customerId",
      vehicles: "id, customerId, regNo",
      creditTxns: "id, customerId, ts, type, [customerId+ts]",
      expenses: "id, stationId, ts, category, shiftId",
      deposits: "id, stationId, ts, shiftId",
      retailItems: "id, stationId, sku, category, [stationId+sku]",
      alerts: "id, severity, type, stationId, ts",
      auditLog: "id, ts, staffId, entity",
      settings: "key",
    });
  }
}

export const db = new FuelOpsDB();

export const SEED_VERSION = 3;

export async function isSeeded(): Promise<boolean> {
  const row = await db.settings.get("seedVersion");
  return row?.value === SEED_VERSION;
}

export async function markSeeded(): Promise<void> {
  await db.settings.put({ key: "seedVersion", value: SEED_VERSION });
}
