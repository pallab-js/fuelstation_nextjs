/** All persisted entity types. Money = paise (int), volume = ml (int), time = epoch ms. */

export interface Base {
  id: string;
  updatedAt: number;
}

export type Role = "owner" | "manager" | "attendant";

export interface Station extends Base {
  id: string;
  code: string;
  name: string;
  city: string;
  address: string;
  timezone: string;
  tolerancePaise: number;
  status: "active" | "inactive";
  openSince: number;
}

export interface Staff extends Base {
  id: string;
  name: string;
  role: Role;
  /** null = network-wide (owner / network manager) */
  stationId: string | null;
  phone: string;
  pinSalt: string;
  pinHash: string;
  active: boolean;
}

export interface PricePoint {
  ts: number;
  unitPricePaise: number;
}

export interface FuelProduct {
  id: string;
  code: string;
  name: string;
  shortName: string;
  unitPricePaise: number;
  /** estimated ex-refinery cost for margin chip only */
  costPaise: number;
  densityGmL: number;
  color: string;
  priceHistory: PricePoint[];
  updatedAt: number;
}

export type ShiftName = "Morning" | "Evening" | "Night";
export type ShiftStatus = "open" | "closed";
export type PaymentMethod = "cash" | "upi" | "card" | "credit";

export interface Pump extends Base {
  id: string;
  stationId: string;
  name: string;
  status: "active" | "maintenance";
}

export interface Nozzle extends Base {
  id: string;
  pumpId: string;
  stationId: string;
  nozzleNo: number;
  productCode: string;
  totalizerMl: number;
  status: "active" | "idle";
}

export interface Tank extends Base {
  id: string;
  stationId: string;
  productCode: string;
  name: string;
  capacityMl: number;
  safeLevelPct: number;
  criticalLevelPct: number;
}

export interface Dip extends Base {
  id: string;
  stationId: string;
  tankId: string;
  ts: number;
  levelMl: number;
  source: "manual" | "auto";
  staffId: string;
}

export interface Delivery extends Base {
  id: string;
  stationId: string;
  tankId: string;
  productCode: string;
  ts: number;
  invoiceNo: string;
  supplier: string;
  volumeMl: number;
  ratePaise: number;
  amountPaise: number;
  staffId: string;
}

export interface Shift extends Base {
  id: string;
  stationId: string;
  staffId: string;
  name: ShiftName;
  status: ShiftStatus;
  openTs: number;
  closeTs?: number;
  openingCashPaise: number;
  openingTotalizers: Record<string, number>;
  closingTotalizers?: Record<string, number>;
}

export interface SaleLine {
  itemId: string;
  sku: string;
  name: string;
  qty: number;
  pricePaise: number;
}

export interface Sale extends Base {
  id: string;
  stationId: string;
  shiftId: string;
  ts: number;
  kind: "fuel" | "retail";
  productCode?: string;
  nozzleId?: string;
  quantityMl?: number;
  unitPricePaise?: number;
  amountPaise: number;
  payment: PaymentMethod;
  customerId?: string;
  attendantId: string;
  receiptNo: string;
  lines?: SaleLine[];
}

export type ReconStatus = "ok" | "short" | "over";

export interface Reconciliation extends Base {
  id: string;
  shiftId: string;
  stationId: string;
  ts: number;
  staffId: string;
  countedPaise: number;
  expectedPaise: number;
  variancePaise: number;
  status: ReconStatus;
  depositedPaise: number;
  note?: string;
}

export interface Customer extends Base {
  id: string;
  code: string;
  name: string;
  phone: string;
  kind: "fleet" | "credit";
}

export interface CreditAccount extends Base {
  id: string;
  customerId: string;
  creditLimitPaise: number;
  dueDays: number;
  active: boolean;
}

export interface Vehicle extends Base {
  id: string;
  customerId: string;
  regNo: string;
  productCode: string;
  monthlyLimitMl: number;
  active: boolean;
}

export interface CreditTxn extends Base {
  id: string;
  customerId: string;
  ts: number;
  type: "charge" | "payment" | "adjustment";
  amountPaise: number;
  saleId?: string;
  dueTs?: number;
  method: PaymentMethod | "bank" | "cash";
  note?: string;
  staffId: string;
}

export type ExpenseCategory =
  | "petty"
  | "maintenance"
  | "utilities"
  | "salary"
  | "supplies"
  | "other";

export interface Expense extends Base {
  id: string;
  stationId: string;
  ts: number;
  category: ExpenseCategory;
  amountPaise: number;
  paidBy: "cash" | "bank";
  voucherNo: string;
  shiftId?: string;
  note: string;
  staffId: string;
}

export interface BankDeposit extends Base {
  id: string;
  stationId: string;
  ts: number;
  amountPaise: number;
  refNo: string;
  shiftId?: string;
  staffId: string;
}

export interface RetailItem extends Base {
  id: string;
  /** null = template shared across stations; stock rows are per station */
  stationId: string;
  sku: string;
  name: string;
  category: string;
  pricePaise: number;
  costPaise: number;
  stockQty: number;
  lowStockAt: number;
  unit: string;
}

export type AlertType =
  | "low-stock"
  | "critical-stock"
  | "wet-stock-variance"
  | "cash-short"
  | "credit-limit"
  | "credit-overdue"
  | "shift-open-long"
  | "low-retail-stock";

export type AlertSeverity = "info" | "warning" | "critical";

export interface Alert extends Base {
  id: string;
  severity: AlertSeverity;
  type: AlertType;
  stationId: string | null;
  refId?: string;
  ts: number;
  title: string;
  message: string;
  acked: boolean;
}

export interface AuditEntry extends Base {
  id: string;
  ts: number;
  staffId: string;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

export interface SeedDataset {
  stations: Station[];
  staff: Staff[];
  products: FuelProduct[];
  pumps: Pump[];
  nozzles: Nozzle[];
  tanks: Tank[];
  dips: Dip[];
  deliveries: Delivery[];
  shifts: Shift[];
  sales: Sale[];
  reconciliations: Reconciliation[];
  customers: Customer[];
  creditAccounts: CreditAccount[];
  vehicles: Vehicle[];
  creditTxns: CreditTxn[];
  expenses: Expense[];
  deposits: BankDeposit[];
  retailItems: RetailItem[];
  alerts: Alert[];
  auditLog: AuditEntry[];
  settings: SettingRow[];
}
