import type { PaymentMethod, Sale, Station } from "@/lib/db/types";
import { dayKey, dayKeys, startOfDay } from "./dates";

export interface DayPoint {
  day: string;
  revenuePaise: number;
  litresMl: number;
  sales: number;
}

export function filterRange<T extends { ts: number }>(rows: T[], from: number, to: number): T[] {
  return rows.filter((r) => r.ts >= from && r.ts <= to);
}

export function trend(sales: Sale[], from: number, to: number): DayPoint[] {
  const keys = dayKeys(from, to);
  const map = new Map<string, DayPoint>(
    keys.map((k) => [k, { day: k, revenuePaise: 0, litresMl: 0, sales: 0 }]),
  );
  for (const s of sales) {
    const p = map.get(dayKey(s.ts));
    if (!p) continue;
    p.revenuePaise += s.amountPaise;
    p.sales += 1;
    if (s.kind === "fuel") p.litresMl += s.quantityMl ?? 0;
  }
  return keys.map((k) => map.get(k)!);
}

export interface StationRow {
  station: Station;
  revenuePaise: number;
  litresMl: number;
  sales: number;
  variancePaise: number;
}

export function leaderboard(
  stations: Station[],
  sales: Sale[],
  varianceByStation: Record<string, number>,
): StationRow[] {
  return stations
    .map((station) => {
      const rows = sales.filter((s) => s.stationId === station.id);
      return {
        station,
        revenuePaise: rows.reduce((a, r) => a + r.amountPaise, 0),
        litresMl: rows.reduce((a, r) => a + (r.kind === "fuel" ? (r.quantityMl ?? 0) : 0), 0),
        sales: rows.length,
        variancePaise: varianceByStation[station.id] ?? 0,
      };
    })
    .sort((a, b) => b.revenuePaise - a.revenuePaise);
}

export function collectionsMix(sales: Sale[]): {
  byPayment: Record<PaymentMethod, number>;
  total: number;
  shares: Record<PaymentMethod, number>;
} {
  const byPayment: Record<PaymentMethod, number> = { cash: 0, upi: 0, card: 0, credit: 0 };
  for (const s of sales) byPayment[s.payment] += s.amountPaise;
  const total = byPayment.cash + byPayment.upi + byPayment.card + byPayment.credit;
  const shares = {
    cash: total ? byPayment.cash / total : 0,
    upi: total ? byPayment.upi / total : 0,
    card: total ? byPayment.card / total : 0,
    credit: total ? byPayment.credit / total : 0,
  };
  return { byPayment, total, shares };
}

export function productMix(sales: Sale[]): { code: string; litresMl: number; revenuePaise: number }[] {
  const map = new Map<string, { code: string; litresMl: number; revenuePaise: number }>();
  for (const s of sales) {
    if (s.kind !== "fuel" || !s.productCode) continue;
    const row = map.get(s.productCode) ?? { code: s.productCode, litresMl: 0, revenuePaise: 0 };
    row.litresMl += s.quantityMl ?? 0;
    row.revenuePaise += s.amountPaise;
    map.set(s.productCode, row);
  }
  return [...map.values()].sort((a, b) => b.litresMl - a.litresMl);
}

/** revenue by hour-of-day (average across distinct days present) */
export function hourlyPattern(sales: Sale[]): number[] {
  const buckets = Array.from({ length: 24 }, () => 0);
  const days = new Set<string>();
  for (const s of sales) {
    const d = new Date(s.ts);
    buckets[d.getHours()] += s.amountPaise;
    days.add(dayKey(s.ts));
  }
  const n = Math.max(1, days.size);
  return buckets.map((v) => v / n);
}

export interface KpiSet {
  revenuePaise: number;
  fuelPaise: number;
  retailPaise: number;
  litresMl: number;
  salesCount: number;
  cashPaise: number;
}

export function kpis(sales: Sale[]): KpiSet {
  let revenuePaise = 0;
  let fuelPaise = 0;
  let retailPaise = 0;
  let litresMl = 0;
  let cashPaise = 0;
  for (const s of sales) {
    revenuePaise += s.amountPaise;
    if (s.kind === "fuel") {
      fuelPaise += s.amountPaise;
      litresMl += s.quantityMl ?? 0;
    } else retailPaise += s.amountPaise;
    if (s.payment === "cash") cashPaise += s.amountPaise;
  }
  return { revenuePaise, fuelPaise, retailPaise, litresMl, salesCount: sales.length, cashPaise };
}

/** Sum of reconciliation variance by station id (for leaderboard). */
export function varianceByStation(
  rows: { stationId: string; variancePaise: number }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.stationId] = (out[r.stationId] ?? 0) + r.variancePaise;
  return out;
}

export function varianceTrend(
  rows: { ts: number; variancePaise: number }[],
  from: number,
  to: number,
): { day: string; variancePaise: number }[] {
  const keys = dayKeys(from, to);
  const map = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const r of rows) {
    const k = dayKey(r.ts);
    if (map.has(k)) map.set(k, map.get(k)! + r.variancePaise);
  }
  return keys.map((day) => ({ day, variancePaise: map.get(day) ?? 0 }));
}

export function rangeLabel(from: number, to: number): string {
  return `${new Date(from).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} – ${new Date(to).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`;
}

export function todayStart(): number {
  return startOfDay(Date.now());
}
