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
  SaleLine,
  SeedDataset,
  SettingRow,
  Shift,
  ShiftName,
  Staff,
  Station,
  Tank,
  Vehicle,
} from "./types";
import { hashPin } from "./pin";
import { evaluateAlerts } from "@/lib/domain/alerts";
import { startOfDay } from "@/lib/domain/dates";
import { computeTankStats } from "@/lib/domain/tanks";

/* ----------------------------- deterministic RNG ----------------------------- */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;

/* ------------------------------- static config ------------------------------- */

interface StationDef {
  id: string;
  code: string;
  name: string;
  city: string;
  address: string;
  tolerancePaise: number;
  pumps: number;
  premium: boolean;
  live: boolean;
  factor: number;
}

const STATIONS: StationDef[] = [
  { id: "st_shf01", code: "SHF-01", name: "Sharma Fuel Hub", city: "Pune", address: "12 FC Road, Pune, MH", tolerancePaise: 10_000, pumps: 2, premium: true, live: true, factor: 1.0 },
  { id: "st_nh44", code: "NH-44", name: "Ashoka Highway Servo", city: "Bengaluru", address: "NH-44, Devanahalli, KA", tolerancePaise: 10_000, pumps: 2, premium: false, live: true, factor: 1.5 },
  { id: "st_rv07", code: "RV-07", name: "Riverside Fuels", city: "Jaipur", address: "Tonk Road, Jaipur, RJ", tolerancePaise: 10_000, pumps: 2, premium: false, live: true, factor: 0.9 },
  { id: "st_ap12", code: "AP-12", name: "Airport Road Petrol", city: "Lucknow", address: "Amausi Airport Rd, Lucknow, UP", tolerancePaise: 20_000, pumps: 2, premium: false, live: false, factor: 1.1 },
  { id: "st_st09", code: "ST-09", name: "Satellite Servo Centre", city: "Surat", address: "VGSD Road, Surat, GJ", tolerancePaise: 10_000, pumps: 1, premium: false, live: false, factor: 0.6 },
];

const STAFF = [
  { id: "us_anita", name: "Anita Deshmukh", role: "owner", stationId: null, phone: "+91 98200 11111" },
  { id: "us_ravi", name: "Ravi Kumar", role: "manager", stationId: "st_shf01", phone: "+91 98200 22222" },
  { id: "us_meera", name: "Meera Iyer", role: "manager", stationId: null, phone: "+91 98200 33333" },
  { id: "us_imran", name: "Imran Sheikh", role: "attendant", stationId: "st_shf01", phone: "+91 98200 44444" },
  { id: "us_farhan", name: "Farhan Ali", role: "attendant", stationId: "st_nh44", phone: "+91 98200 55555" },
  { id: "us_deepa", name: "Deepa Rao", role: "attendant", stationId: "st_rv07", phone: "+91 98200 66666" },
  { id: "us_sunil", name: "Sunil Verma", role: "attendant", stationId: "st_ap12", phone: "+91 98200 77777" },
  { id: "us_kavita", name: "Kavita Sharma", role: "attendant", stationId: "st_st09", phone: "+91 98200 88888" },
] as const;

const ATTENDANT_BY_STATION: Record<string, string> = {
  st_shf01: "us_imran",
  st_nh44: "us_farhan",
  st_rv07: "us_deepa",
  st_ap12: "us_sunil",
  st_st09: "us_kavita",
};

const PRODUCT_DEFS = [
  { code: "PETROL", name: "Petrol (MS)", short: "Petrol", price: 10240, cost: 9660, density: 0.745, color: "#1863dc" },
  { code: "DIESEL", name: "High Speed Diesel", short: "Diesel", price: 9410, cost: 8890, density: 0.84, color: "#003c33" },
  { code: "PREMIUM", name: "Premium Petrol (XP100)", short: "Premium", price: 11680, cost: 10980, density: 0.76, color: "#9b60aa" },
];

const CUSTOMERS = [
  { id: "cu_1", code: "FL-001", name: "Swift Logistics", stationId: "st_shf01", limit: 250_000_00, dueDays: 15, kind: "fleet", vehicle: "MH 12 KJ 4410" },
  { id: "cu_2", code: "FL-002", name: "Deccan Couriers", stationId: "st_shf01", limit: 150_000_00, dueDays: 15, kind: "fleet", vehicle: "MH 14 RT 9021" },
  { id: "cu_3", code: "FL-003", name: "RedWay Cabs", stationId: "st_nh44", limit: 300_000_00, dueDays: 20, kind: "fleet", vehicle: "KA 05 MN 7788" },
  { id: "cu_4", code: "FL-004", name: "Ganga Transport Co.", stationId: "st_ap12", limit: 100_000_00, dueDays: 15, kind: "credit", vehicle: "UP 32 LN 5512" },
  { id: "cu_5", code: "FL-005", name: "Desert Rose Travels", stationId: "st_rv07", limit: 90_000_00, dueDays: 15, kind: "fleet", vehicle: "RJ 14 GB 3390" },
  { id: "cu_6", code: "CR-006", name: "Patel Traders (Credit)", stationId: "st_st09", limit: 75_000_00, dueDays: 15, kind: "credit", vehicle: "GJ 05 BX 1122" },
];

const RETAIL_CATALOG = [
  { sku: "OIL-20W50", name: "Engine Oil 20W-50 (1L)", category: "Lubricants", price: 65_000, cost: 51_000, unit: "pcs", low: 6 },
  { sku: "OIL-10W30", name: "Engine Oil 10W-30 (1L)", category: "Lubricants", price: 72_000, cost: 57_000, unit: "pcs", low: 6 },
  { sku: "COOL-1L", name: "Coolant Concentrate (1L)", category: "Chemicals", price: 32_000, cost: 24_000, unit: "pcs", low: 8 },
  { sku: "BRK-FL", name: "Brake Fluid (500ml)", category: "Chemicals", price: 29_000, cost: 22_000, unit: "pcs", low: 5 },
  { sku: "WSH-2L", name: "Windshield Washer (2L)", category: "Chemicals", price: 18_000, cost: 12_500, unit: "pcs", low: 8 },
  { sku: "WAT-1L", name: "Packaged Water 1L", category: "Beverages", price: 2_000, cost: 1_200, unit: "btl", low: 12 },
  { sku: "ENG-D", name: "Energy Drink 250ml", category: "Beverages", price: 10_000, cost: 7_200, unit: "btl", low: 10 },
  { sku: "SNK-CHP", name: "Namkeen Chips 90g", category: "Snacks", price: 2_000, cost: 1_400, unit: "pcs", low: 15 },
];

const WINDOWS: { name: ShiftName; startH: number; lenH: number }[] = [
  { name: "Morning", startH: 6, lenH: 8 },
  { name: "Evening", startH: 14, lenH: 8 },
  { name: "Night", startH: 22, lenH: 8 },
];

/* --------------------------------- helpers ---------------------------------- */

function ri(rng: () => number, a: number, b: number): number {
  return a + Math.floor(rng() * (b - a + 1));
}
function rf(rng: () => number, a: number, b: number): number {
  return a + rng() * (b - a);
}
function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
const pad = (n: number, w: number) => String(n).padStart(w, "0");

/* --------------------------------- events ----------------------------------- */

type Ev =
  | { ts: number; rank: number; kind: "dayStart"; stationId: string }
  | { ts: number; rank: number; kind: "shiftOpen"; stationId: string; staffId: string; name: ShiftName }
  | { ts: number; rank: number; kind: "shiftClose"; stationId: string; name: ShiftName }
  | { ts: number; rank: number; kind: "fuelSale"; stationId: string; shiftName: ShiftName; staffId: string; nozzleId: string; productCode: string; ml: number; payment: Sale["payment"]; customerId?: string }
  | { ts: number; rank: number; kind: "retailSale"; stationId: string; shiftName: ShiftName; staffId: string; payment: Sale["payment"]; lineCount: number }
  | { ts: number; rank: number; kind: "expense"; stationId: string; staffId: string; category: Expense["category"]; amountPaise: number; paidBy: "cash" | "bank" }
  | { ts: number; rank: number; kind: "deposit"; stationId: string; staffId: string; frac: number }
  | { ts: number; rank: number; kind: "delivery"; stationId: string; staffId: string; tankId: string; targetPct: number }
  | { ts: number; rank: number; kind: "dip"; stationId: string; staffId: string; tankId: string }
  | { ts: number; rank: number; kind: "leak"; tankId: string; ml: number }
  | { ts: number; rank: number; kind: "creditPayment"; customerId: string; staffId: string; frac: number }
  | { ts: number; rank: number; kind: "creditAdj"; customerId: string; staffId: string; amountPaise: number; note: string };

const RANK = {
  dayStart: 0,
  shiftClose: 1,
  dip: 2,
  shiftOpen: 3,
  fuelSale: 4,
  retailSale: 4,
  delivery: 5,
  expense: 6,
  deposit: 7,
  leak: 8,
  creditPayment: 9,
  creditAdj: 9,
} as const;

/* ------------------------------- generator ---------------------------------- */

export async function generateSeedDataset(now = Date.now(), seed = 20260926): Promise<SeedDataset> {
  const rng = mulberry32(seed);
  const today0 = startOfDay(now);

  /* reference data */
  const products: FuelProduct[] = PRODUCT_DEFS.map((p) => {
    const priceHistory: { ts: number; unitPricePaise: number }[] = [];
    const start = now - 88 * DAY;
    const steps = 7;
    for (let i = 0; i < steps; i++) {
      const ts = start + Math.round(((now - start) * i) / steps);
      const t = i / (steps - 1);
      priceHistory.push({
        ts,
        unitPricePaise: i === steps - 1 ? p.price : Math.max(Math.round(p.price - 600 + t * 600 + (rng() - 0.5) * 60), p.price - 700),
      });
    }
    return {
      id: p.code,
      code: p.code,
      name: p.name,
      shortName: p.short,
      unitPricePaise: p.price,
      costPaise: p.cost,
      densityGmL: p.density,
      color: p.color,
      priceHistory,
      updatedAt: now,
    };
  });
  const priceAt = (code: string, ts: number) => {
    const p = products.find((x) => x.code === code)!;
    let v = p.priceHistory[0].unitPricePaise;
    for (const h of p.priceHistory) if (h.ts <= ts) v = h.unitPricePaise;
    return v;
  };

  const staff: Staff[] = await Promise.all(
    STAFF.map(async (s) => ({
      id: s.id,
      name: s.name,
      role: s.role as Staff["role"],
      stationId: s.stationId,
      phone: s.phone,
      pinSalt: `seedsalt-${s.id}`,
      pinHash: await hashPin("1234", `seedsalt-${s.id}`),
      active: true,
      updatedAt: now,
    })),
  );

  const stations: Station[] = STATIONS.map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    city: d.city,
    address: d.address,
    timezone: "Asia/Kolkata",
    tolerancePaise: d.tolerancePaise,
    status: "active",
    openSince: now - 400 * DAY,
    updatedAt: now,
  }));

  const pumps: Pump[] = [];
  const nozzles: Nozzle[] = [];
  const tanks: Tank[] = [];
  const retailItems: RetailItem[] = [];

  for (const d of STATIONS) {
    for (let p = 1; p <= d.pumps; p++) {
      const pumpId = `pm_${d.id}_${p}`;
      pumps.push({ id: pumpId, stationId: d.id, name: `Pump ${p}`, status: "active", updatedAt: now });
      let n = 1;
      const nozzleProducts = d.premium && p === d.pumps ? ["PETROL", "PREMIUM"] : ["PETROL", "DIESEL"];
      for (const code of nozzleProducts) {
        nozzles.push({
          id: `nz_${d.id}_${p}${n}`,
          pumpId,
          stationId: d.id,
          nozzleNo: n,
          productCode: code,
          totalizerMl: ri(rng, 150_000_000, 950_000_000),
          status: "active",
          updatedAt: now,
        });
        n++;
      }
    }
    tanks.push({ id: `tk_${d.id}_P`, stationId: d.id, productCode: "PETROL", name: "Petrol Tank", capacityMl: 18_000_000, safeLevelPct: 25, criticalLevelPct: 12, updatedAt: now });
    tanks.push({ id: `tk_${d.id}_D`, stationId: d.id, productCode: "DIESEL", name: "Diesel Tank", capacityMl: 15_000_000, safeLevelPct: 25, criticalLevelPct: 10, updatedAt: now });
    if (d.premium) tanks.push({ id: `tk_${d.id}_PM`, stationId: d.id, productCode: "PREMIUM", name: "Premium Tank", capacityMl: 6_000_000, safeLevelPct: 30, criticalLevelPct: 15, updatedAt: now });

    RETAIL_CATALOG.forEach((r, i) => {
      retailItems.push({
        id: `ri_${d.id}_${i + 1}`,
        stationId: d.id,
        sku: r.sku,
        name: r.name,
        category: r.category,
        pricePaise: r.price,
        costPaise: r.cost,
        stockQty: ri(rng, r.low + 4, r.low + 45),
        lowStockAt: r.low,
        unit: r.unit,
        updatedAt: now,
      });
    });
  }
  const lowItem = retailItems.find((r) => r.id === "ri_st_shf01_3");
  if (lowItem) lowItem.stockQty = 3;

  const customers: Customer[] = [];
  const creditAccounts: CreditAccount[] = [];
  const vehicles: Vehicle[] = [];
  CUSTOMERS.forEach((c, i) => {
    customers.push({ id: c.id, code: c.code, name: c.name, phone: `+91 9${900000000 + i * 11111111}`, kind: c.kind as Customer["kind"], updatedAt: now });
    creditAccounts.push({ id: `ca_${c.id}`, customerId: c.id, creditLimitPaise: c.limit, dueDays: c.dueDays, active: true, updatedAt: now });
    vehicles.push({ id: `vh_${c.id}_1`, customerId: c.id, regNo: c.vehicle, productCode: i % 2 === 0 ? "DIESEL" : "PETROL", monthlyLimitMl: ri(rng, 3_000_000, 9_000_000), active: true, updatedAt: now });
  });

  const customersByStation = new Map<string, (typeof CUSTOMERS)[number][]>();
  for (const c of CUSTOMERS) {
    const list = customersByStation.get(c.stationId) ?? [];
    list.push(c);
    customersByStation.set(c.stationId, list);
  }

  const tanksByStation = (sid: string) => tanks.filter((t) => t.stationId === sid);
  const tankForProduct = (sid: string, code: string) => tanks.find((t) => t.stationId === sid && t.productCode === code);
  const nozzlesByStation = (sid: string) => nozzles.filter((n) => n.stationId === sid);

  /* ---------------------------- event generation ---------------------------- */

  const events: Ev[] = [];
  const deliveryCursor: Record<string, number> = {};
  for (const d of STATIONS) deliveryCursor[d.id] = 89 - ri(rng, 0, 4);

  for (let daysAgo = 89; daysAgo >= 0; daysAgo--) {
    const day0 = today0 - daysAgo * DAY;

    for (const d of STATIONS) {
      events.push({ ts: day0 + 5 * HOUR + 59 * MIN, rank: RANK.dayStart, kind: "dayStart", stationId: d.id });

      for (const w of WINDOWS) {
        const openTs = day0 + w.startH * HOUR;
        const closeTs = openTs + w.lenH * HOUR;
        if (openTs > now) continue;
        const isOpenWindow = closeTs > now;
        if (isOpenWindow && !d.live) continue;

        events.push({ ts: openTs, rank: RANK.shiftOpen, kind: "shiftOpen", stationId: d.id, staffId: ATTENDANT_BY_STATION[d.id], name: w.name });
        if (!isOpenWindow) events.push({ ts: closeTs, rank: RANK.shiftClose, kind: "shiftClose", stationId: d.id, name: w.name });

        const windowEnd = Math.min(closeTs, now);
        const span = Math.max(6 * MIN, windowEnd - openTs - 5 * MIN);
        const nSales = Math.max(2, Math.round((3 + rng() * 5) * d.factor));
        const fleet = customersByStation.get(d.id) ?? [];

        for (let i = 0; i < nSales; i++) {
          const ts = openTs + 5 * MIN + Math.floor(rf(rng, 0, span));
          if (ts > now) continue;
          const nozzle = pick(rng, nozzlesByStation(d.id));
          const base = rf(rng, 15, 110) * (d.factor > 1.2 ? 1.3 : 1);
          const ml = Math.max(1_000, Math.round(base * 1000));

          let payment: Sale["payment"];
          const r = rng();
          if (r < 0.4) payment = "cash";
          else if (r < 0.75) payment = "upi";
          else if (r < 0.9) payment = "card";
          else payment = fleet.length > 0 ? "credit" : "upi";

          let customerId: string | undefined;
          if (payment === "credit") {
            const cust = pick(rng, fleet);
            if (!cust || (cust.id === "cu_4" && daysAgo < 30)) payment = "upi";
            else customerId = cust.id;
          }

          events.push({
            ts,
            rank: RANK.fuelSale,
            kind: "fuelSale",
            stationId: d.id,
            shiftName: w.name,
            staffId: ATTENDANT_BY_STATION[d.id],
            nozzleId: nozzle.id,
            productCode: nozzle.productCode,
            ml,
            payment,
            customerId,
          });
        }

        if (rng() < 0.45) {
          const ts = openTs + 10 * MIN + Math.floor(rf(rng, 0, Math.max(6 * MIN, windowEnd - openTs - 15 * MIN)));
          if (ts <= now) {
            const r = rng();
            const payment: Sale["payment"] = r < 0.5 ? "cash" : r < 0.85 ? "upi" : "card";
            events.push({ ts, rank: RANK.retailSale, kind: "retailSale", stationId: d.id, shiftName: w.name, staffId: ATTENDANT_BY_STATION[d.id], payment, lineCount: ri(rng, 1, 3) });
          }
        }
      }

      /* daily expense */
      if (rng() < 0.75) {
        const ts = day0 + ri(rng, 10, 20) * HOUR;
        if (ts <= now) {
          const category = pick(rng, ["petty", "petty", "maintenance", "utilities", "supplies", "other"] as const);
          events.push({
            ts,
            rank: RANK.expense,
            kind: "expense",
            stationId: d.id,
            staffId: ATTENDANT_BY_STATION[d.id],
            category,
            amountPaise: ri(rng, 200, 5_000) * 100,
            paidBy: rng() < 0.6 ? "cash" : "bank",
          });
        }
      }

      /* daily bank deposit */
      const depTs = day0 + 20 * HOUR;
      if (depTs <= now) {
        events.push({ ts: depTs, rank: RANK.deposit, kind: "deposit", stationId: d.id, staffId: ATTENDANT_BY_STATION[d.id], frac: rf(rng, 0.72, 0.86) });
      }

      /* routine delivery every 5–6 days */
      if (daysAgo <= deliveryCursor[d.id]) {
        const ts = day0 + ri(rng, 8, 11) * HOUR;
        if (ts <= now) {
          events.push({
            ts,
            rank: RANK.delivery,
            kind: "delivery",
            stationId: d.id,
            staffId: ATTENDANT_BY_STATION[d.id],
            tankId: "", // resolved at apply: emptiest eligible tank
            targetPct: rf(rng, 0.55, 0.82),
          });
          deliveryCursor[d.id] = daysAgo - ri(rng, 5, 6);
        }
      }

      /* planted ST-09 diesel refill (day -18) */
      if (d.id === "st_st09" && daysAgo === 18) {
        events.push({ ts: day0 + 9 * HOUR, rank: RANK.delivery, kind: "delivery", stationId: d.id, staffId: ATTENDANT_BY_STATION[d.id], tankId: "tk_st_st09_D", targetPct: 0.7 });
      }

      /* planted ST-09 emergency refill (yesterday) — refuels the leak story */
      if (d.id === "st_st09" && daysAgo === 1) {
        events.push({ ts: day0 + 9 * HOUR, rank: RANK.delivery, kind: "delivery", stationId: d.id, staffId: ATTENDANT_BY_STATION[d.id], tankId: "tk_st_st09_D", targetPct: 0.55 });
      }

      /* planted ST-09 overnight theft (last night) — drains tank to critical */
      if (d.id === "st_st09" && daysAgo === 0) {
        const ts = day0 + 2 * HOUR;
        if (ts <= now) events.push({ ts, rank: RANK.leak, kind: "leak", tankId: "tk_st_st09_D", ml: 6_500_000 });
      }

      /* dips */
      for (const [h, m] of [
        [6, 40],
        [18, 40],
      ] as const) {
        const ts = day0 + h * HOUR + m * MIN;
        if (ts > now) continue;
        for (const t of tanksByStation(d.id)) {
          events.push({ ts, rank: RANK.dip, kind: "dip", stationId: d.id, staffId: ATTENDANT_BY_STATION[d.id], tankId: t.id });
        }
      }

      /* planted leak — ST-09 diesel loses 400 L/day */
      if (d.id === "st_st09" && daysAgo <= 17) {
        const ts = day0 + 23 * HOUR + 50 * MIN;
        if (ts <= now) events.push({ ts, rank: RANK.leak, kind: "leak", tankId: "tk_st_st09_D", ml: 400_000 });
      }
    }

    /* credit payments */
    for (const c of CUSTOMERS) {
      if (rng() < 0.25) {
        const ts = day0 + ri(rng, 11, 17) * HOUR;
        if (ts <= now && !(c.id === "cu_4" && daysAgo <= 35) && !(c.id === "cu_5" && daysAgo <= 40)) {
          events.push({ ts, rank: RANK.creditPayment, kind: "creditPayment", customerId: c.id, staffId: "us_meera", frac: rf(rng, 0.5, 1) });
        }
      }
    }

    /* planted credit scenarios */
    if (daysAgo === 40) {
      events.push({ ts: day0 + 12 * HOUR, rank: RANK.creditAdj, kind: "creditAdj", customerId: "cu_4", staffId: "us_meera", amountPaise: 150_000_00, note: "Pending fleet settlement — invoiced manually" });
    }
    if (daysAgo === 45) {
      events.push({ ts: day0 + 12 * HOUR, rank: RANK.creditAdj, kind: "creditAdj", customerId: "cu_5", staffId: "us_meera", amountPaise: 55_000_00, note: "Charter advance adjustment" });
    }
  }

  events.sort((a, b) => a.ts - b.ts || a.rank - b.rank);

  /* ------------------------------- apply pass -------------------------------- */

  const shifts: Shift[] = [];
  const sales: Sale[] = [];
  const recons: Reconciliation[] = [];
  const expenses: Expense[] = [];
  const deposits: BankDeposit[] = [];
  const deliveries: Delivery[] = [];
  const dips: Dip[] = [];
  const creditTxns: CreditTxn[] = [];

  const seq = { sale: 1, shift: 1, recon: 1, expense: 1, deposit: 1, delivery: 1, dip: 1, credit: 1 };

  const level: Record<string, number> = {};
  for (const t of tanks) level[t.id] = Math.round(t.capacityMl * rf(rng, 0.55, 0.85));

  const cashCarry: Record<string, number | null> = Object.fromEntries(STATIONS.map((s) => [s.id, null]));
  const receiptSeq: Record<string, number> = Object.fromEntries(STATIONS.map((s) => [s.id, ri(rng, 400, 900)]));
  const dayCash: Record<string, number> = {};
  const balance = new Map<string, number>(CUSTOMERS.map((c) => [c.id, 0]));

  const findShift = (stationId: string, name: ShiftName) => {
    for (let i = shifts.length - 1; i >= 0; i--) {
      const s = shifts[i];
      if (s.stationId === stationId && s.name === name && s.status === "open") return s;
    }
    return null;
  };
  const shiftCovering = (stationId: string, ts: number) => {
    for (let i = shifts.length - 1; i >= 0; i--) {
      const s = shifts[i];
      if (s.stationId !== stationId) continue;
      if (ts >= s.openTs && (s.closeTs === undefined || ts < s.closeTs)) return s;
    }
    return null;
  };
  const tankFor = (sale: { stationId: string; productCode?: string }) =>
    sale.productCode ? tankForProduct(sale.stationId, sale.productCode) : undefined;

  for (const ev of events) {
    if (ev.ts > now) continue;

    switch (ev.kind) {
      case "dayStart": {
        dayCash[ev.stationId] = 0;
        break;
      }
      case "shiftOpen": {
        shifts.push({
          id: `sf_${pad(seq.shift++, 5)}`,
          stationId: ev.stationId,
          staffId: ev.staffId,
          name: ev.name,
          status: "open",
          openTs: ev.ts,
          openingCashPaise: cashCarry[ev.stationId] ?? ri(rng, 8_000, 15_000) * 100,
          openingTotalizers: Object.fromEntries(nozzlesByStation(ev.stationId).map((n) => [n.id, n.totalizerMl])),
          updatedAt: ev.ts,
        });
        break;
      }
      case "shiftClose": {
        const shift = findShift(ev.stationId, ev.name);
        if (!shift) break;
        const stDef = STATIONS.find((s) => s.id === shift.stationId)!;
        shift.status = "closed";
        shift.closeTs = ev.ts;
        shift.closingTotalizers = Object.fromEntries(nozzlesByStation(shift.stationId).map((n) => [n.id, n.totalizerMl]));
        shift.updatedAt = ev.ts;

        const shiftSales = sales.filter((s) => s.shiftId === shift.id);
        const cashSales = shiftSales.filter((s) => s.payment === "cash").reduce((a, s) => a + s.amountPaise, 0);
        const cashExp = expenses.filter((e) => e.shiftId === shift.id && e.paidBy === "cash").reduce((a, e) => a + e.amountPaise, 0);
        const dep = deposits.filter((x) => x.shiftId === shift.id).reduce((a, x) => a + x.amountPaise, 0);
        const expected = shift.openingCashPaise + cashSales - cashExp - dep;

        let noise = Math.round(rf(rng, -80, 80)) * 100;
        const rvPlant = shift.stationId === "st_rv07" && shift.name === "Evening" && startOfDay(ev.ts) === today0 - 2 * DAY;
        if (rvPlant) noise = -185_000;
        else if (rng() < 0.05) noise = -ri(rng, 150, 900) * 100;
        else if (rng() < 0.03) noise = ri(rng, 150, 400) * 100;

        const counted = expected + noise;
        const variance = counted - expected;
        const status = Math.abs(variance) <= stDef.tolerancePaise ? "ok" : variance < 0 ? "short" : "over";

        recons.push({
          id: `rc_${pad(seq.recon++, 5)}`,
          shiftId: shift.id,
          stationId: shift.stationId,
          ts: ev.ts,
          staffId: shift.staffId,
          countedPaise: counted,
          expectedPaise: expected,
          variancePaise: variance,
          status,
          depositedPaise: dep,
          note: rvPlant ? "Short — under investigation" : undefined,
          updatedAt: ev.ts,
        });
        cashCarry[shift.stationId] = counted;
        break;
      }
      case "fuelSale": {
        const shift = findShift(ev.stationId, ev.shiftName);
        if (!shift) break;
        const unitPricePaise = priceAt(ev.productCode, ev.ts);
        const amountPaise = Math.round((ev.ml * unitPricePaise) / 1000);
        receiptSeq[ev.stationId] += 1;
        const sale: Sale = {
          id: `sl_${pad(seq.sale++, 6)}`,
          stationId: ev.stationId,
          shiftId: shift.id,
          ts: ev.ts,
          kind: "fuel",
          productCode: ev.productCode,
          nozzleId: ev.nozzleId,
          quantityMl: ev.ml,
          unitPricePaise,
          amountPaise,
          payment: ev.payment,
          customerId: ev.customerId,
          attendantId: ev.staffId,
          receiptNo: `R-${pad(receiptSeq[ev.stationId], 6)}`,
          updatedAt: ev.ts,
        };
        sales.push(sale);

        const nz = nozzles.find((n) => n.id === ev.nozzleId);
        if (nz) nz.totalizerMl += ev.ml;
        const tank = tankFor(sale);
        if (tank) level[tank.id] = Math.max(0, level[tank.id] - ev.ml);
        if (ev.payment === "cash") dayCash[ev.stationId] = (dayCash[ev.stationId] ?? 0) + amountPaise;

        if (ev.payment === "credit" && ev.customerId) {
          const acct = creditAccounts.find((a) => a.customerId === ev.customerId)!;
          creditTxns.push({
            id: `ct_${pad(seq.credit++, 5)}`,
            customerId: ev.customerId,
            ts: ev.ts,
            type: "charge",
            amountPaise,
            saleId: sale.id,
            dueTs: ev.ts + acct.dueDays * DAY,
            method: "credit",
            note: `${STATIONS.find((s) => s.id === ev.stationId)!.code} · ${ev.productCode} fuel`,
            staffId: ev.staffId,
            updatedAt: ev.ts,
          });
          balance.set(ev.customerId, (balance.get(ev.customerId) ?? 0) + amountPaise);
        }
        break;
      }
      case "retailSale": {
        const shift = findShift(ev.stationId, ev.shiftName);
        if (!shift) break;
        const candidates = retailItems.filter((r) => r.stationId === ev.stationId && r.stockQty > 0);
        if (candidates.length === 0) break;
        const lines: SaleLine[] = [];
        for (let i = 0; i < ev.lineCount; i++) {
          const inStock = retailItems.filter((r) => r.stationId === ev.stationId && r.stockQty > 0);
          if (inStock.length === 0) break;
          const item = pick(rng, inStock);
          const qty = Math.min(item.stockQty, ri(rng, 1, 2));
          const existing = lines.find((l) => l.itemId === item.id);
          if (existing) existing.qty += qty;
          else lines.push({ itemId: item.id, sku: item.sku, name: item.name, qty, pricePaise: item.pricePaise });
          item.stockQty -= qty;
        }
        if (lines.length === 0) break;
        receiptSeq[ev.stationId] += 1;
        const amountPaise = lines.reduce((a, l) => a + l.qty * l.pricePaise, 0);
        sales.push({
          id: `sl_${pad(seq.sale++, 6)}`,
          stationId: ev.stationId,
          shiftId: shift.id,
          ts: ev.ts,
          kind: "retail",
          amountPaise,
          payment: ev.payment,
          attendantId: ev.staffId,
          receiptNo: `R-${pad(receiptSeq[ev.stationId], 6)}`,
          lines,
          updatedAt: ev.ts,
        });
        if (ev.payment === "cash") dayCash[ev.stationId] = (dayCash[ev.stationId] ?? 0) + amountPaise;
        break;
      }
      case "expense": {
        const shift = shiftCovering(ev.stationId, ev.ts);
        expenses.push({
          id: `ex_${pad(seq.expense++, 5)}`,
          stationId: ev.stationId,
          ts: ev.ts,
          category: ev.category,
          amountPaise: ev.amountPaise,
          paidBy: ev.paidBy,
          voucherNo: `VCH-${pad(seq.expense, 4)}`,
          shiftId: shift?.id,
          note:
            ev.category === "petty"
              ? "Petty cash — supplies"
              : ev.category === "maintenance"
                ? "Dispenser service"
                : "Operating expense",
          staffId: ev.staffId,
          updatedAt: ev.ts,
        });
        break;
      }
      case "deposit": {
        const cash = dayCash[ev.stationId] ?? 0;
        if (cash < 100_000) break;
        const shift = shiftCovering(ev.stationId, ev.ts);
        deposits.push({
          id: `bd_${pad(seq.deposit++, 5)}`,
          stationId: ev.stationId,
          ts: ev.ts,
          amountPaise: Math.round((cash * ev.frac) / 10_000) * 10_000,
          refNo: `DEP-${pad(seq.deposit, 4)}`,
          shiftId: shift?.id,
          staffId: ev.staffId,
          updatedAt: ev.ts,
        });
        break;
      }
      case "delivery": {
        let tankId = ev.tankId;
        if (!tankId) {
          const eligible = tanksByStation(ev.stationId).filter((t) => {
            if (ev.stationId === "st_st09" && t.productCode === "DIESEL") {
              return ev.ts < today0 - 18 * DAY;
            }
            return true;
          });
          const emptiest = [...eligible].sort((a, b) => level[a.id] / a.capacityMl - level[b.id] / b.capacityMl)[0];
          if (!emptiest) break;
          tankId = emptiest.id;
        }
        const tank = tanks.find((t) => t.id === tankId)!;
        const volumeMl = Math.max(0, Math.round(tank.capacityMl * ev.targetPct - level[tankId]));
        if (volumeMl < 500_000) break;
        const rate = priceAt(tank.productCode, ev.ts) - 300;
        deliveries.push({
          id: `dl_${pad(seq.delivery++, 5)}`,
          stationId: ev.stationId,
          tankId,
          productCode: tank.productCode,
          ts: ev.ts,
          invoiceNo: `INV/25-26/${pad(seq.delivery, 4)}`,
          supplier: pick(rng, ["HPCL Depot", "BPCL Depot", "IOCL Terminal", "Shell Supply"]),
          volumeMl,
          ratePaise: rate,
          amountPaise: Math.round((volumeMl * rate) / 1000),
          staffId: ev.staffId,
          updatedAt: ev.ts,
        });
        level[tankId] += volumeMl;
        break;
      }
      case "dip": {
        const noise = 1 + (rng() - 0.5) * 0.002;
        dips.push({
          id: `dp_${pad(seq.dip++, 6)}`,
          stationId: ev.stationId,
          tankId: ev.tankId,
          ts: ev.ts,
          levelMl: Math.max(0, Math.round(level[ev.tankId] * noise)),
          source: "manual",
          staffId: ev.staffId,
          updatedAt: ev.ts,
        });
        break;
      }
      case "leak": {
        level[ev.tankId] = Math.max(0, level[ev.tankId] - ev.ml);
        break;
      }
      case "creditPayment": {
        const bal = balance.get(ev.customerId) ?? 0;
        if (bal <= 0) break;
        const amount = Math.min(bal, Math.round((bal * ev.frac) / 5_000) * 5_000);
        if (amount <= 0) break;
        creditTxns.push({
          id: `ct_${pad(seq.credit++, 5)}`,
          customerId: ev.customerId,
          ts: ev.ts,
          type: "payment",
          amountPaise: amount,
          method: "bank",
          note: "NEFT settlement",
          staffId: ev.staffId,
          updatedAt: ev.ts,
        });
        balance.set(ev.customerId, bal - amount);
        break;
      }
      case "creditAdj": {
        creditTxns.push({
          id: `ct_${pad(seq.credit++, 5)}`,
          customerId: ev.customerId,
          ts: ev.ts,
          type: "adjustment",
          amountPaise: ev.amountPaise,
          method: "cash",
          note: ev.note,
          staffId: ev.staffId,
          updatedAt: ev.ts,
        });
        balance.set(ev.customerId, (balance.get(ev.customerId) ?? 0) + ev.amountPaise);
        break;
      }
    }
  }

  /* --------------------------------- alerts ---------------------------------- */

  const staffNames = Object.fromEntries(staff.map((s) => [s.id, s.name]));

  // 90 days of retail sales can sell items out — top shop stock back up to
  // plausible on-hand levels (keeps only the planted low-stock scenario low).
  for (const item of retailItems) {
    if (item.id === "ri_st_shf01_3") {
      item.stockQty = 3;
      continue;
    }
    if (item.stockQty <= item.lowStockAt) item.stockQty = item.lowStockAt + 5 + ri(rng, 0, 25);
  }

  const tankStats = computeTankStats({ stations, tanks, dips, deliveries, sales, now });

  const creditStats = customers.map((c) => {
    const txns = creditTxns.filter((t) => t.customerId === c.id);
    return {
      customerId: c.id,
      name: c.name,
      balancePaise: txns.reduce((a, t) => (t.type === "payment" ? a - t.amountPaise : a + t.amountPaise), 0),
      limitPaise: creditAccounts.find((a) => a.customerId === c.id)!.creditLimitPaise,
      txns,
    };
  });

  const alerts: Alert[] = evaluateAlerts({
    now,
    stations,
    tankStats,
    openShifts: shifts.filter((s) => s.status === "open"),
    staffNames,
    recons: recons.filter((r) => r.status !== "ok" && r.ts >= now - 7 * DAY).slice(-40),
    creditStats,
    retailItems: retailItems.filter((r) => r.stockQty <= r.lowStockAt),
  });

  const auditLog: AuditEntry[] = [
    {
      id: "au_00001",
      ts: now,
      staffId: "us_anita",
      action: "seed",
      entity: "database",
      entityId: "fuelops",
      summary: `Seeded 90 days of demo data — ${stations.length} outlets, ${sales.length} sales, ${shifts.length} shifts`,
      updatedAt: now,
    },
  ];

  const settings: SettingRow[] = [
    { key: "seedVersion", value: 1 },
    { key: "currency", value: "INR" },
    { key: "defaultTolerancePaise", value: 10_000 },
    { key: "demoHints", value: true },
  ];

  return {
    stations,
    staff,
    products,
    pumps,
    nozzles,
    tanks,
    dips,
    deliveries,
    shifts,
    sales,
    reconciliations: recons,
    customers,
    creditAccounts,
    vehicles,
    creditTxns,
    expenses,
    deposits,
    retailItems,
    alerts,
    auditLog,
    settings,
  };
}
