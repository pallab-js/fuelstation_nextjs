import type { Delivery, Dip, FuelProduct, Sale, Station, Tank } from "@/lib/db/types";
import { wetStockVariancePct } from "./variance";

export interface TankStat {
  tankId: string;
  stationId: string;
  productCode: string;
  name: string;
  stationName: string;
  capacityMl: number;
  /** dip-anchored current level (book stock) */
  levelMl: number;
  pct: number;
  safeLevelPct: number;
  criticalLevelPct: number;
  /** latest dip reading, if any */
  dipMl?: number;
  lastDipTs?: number;
  /** dip vs projected book from the previous dip — leak/thief detector */
  variancePct?: number;
  stockStatus: "ok" | "low" | "critical" | "unknown";
}

interface Input {
  stations: Station[];
  tanks: Tank[];
  dips: Dip[];
  deliveries: Delivery[];
  sales: Sale[];
  products?: FuelProduct[];
  now?: number;
}

const sumBetween = (
  rows: { ts: number; value: number }[],
  fromTs: number,
  toTs: number,
): number => {
  let total = 0;
  for (const r of rows) if (r.ts > fromTs && r.ts <= toTs) total += r.value;
  return total;
};

/**
 * Single source of truth for tank levels & wet-stock variance.
 * level(now) = last dip + deliveries since − fuel sold since (dip-anchored book stock).
 * variance   = last dip vs book projected from the dip before it.
 */
export function computeTankStats(input: Input): TankStat[] {
  const now = input.now ?? Date.now();
  const stationName = new Map(input.stations.map((s) => [s.id, s.name]));

  // group once — O(rows)
  const dipsByTank = new Map<string, Dip[]>();
  for (const d of input.dips) {
    const list = dipsByTank.get(d.tankId) ?? [];
    list.push(d);
    dipsByTank.set(d.tankId, list);
  }
  const delivByTank = new Map<string, { ts: number; value: number }[]>();
  for (const d of input.deliveries) {
    const list = delivByTank.get(d.tankId) ?? [];
    list.push({ ts: d.ts, value: d.volumeMl });
    delivByTank.set(d.tankId, list);
  }
  const salesByKey = new Map<string, { ts: number; value: number }[]>();
  for (const s of input.sales) {
    if (s.kind !== "fuel" || !s.productCode || !s.quantityMl) continue;
    const key = `${s.stationId}|${s.productCode}`;
    const list = salesByKey.get(key) ?? [];
    list.push({ ts: s.ts, value: s.quantityMl });
    salesByKey.set(key, list);
  }

  const stats: TankStat[] = [];
  for (const tank of input.tanks) {
    const tankDips = (dipsByTank.get(tank.id) ?? []).sort((a, b) => a.ts - b.ts);
    const delivs = delivByTank.get(tank.id) ?? [];
    const sales = salesByKey.get(`${tank.stationId}|${tank.productCode}`) ?? [];

    const lastDip = tankDips[tankDips.length - 1];
    const prevDip = tankDips[tankDips.length - 2];

    let variancePct: number | undefined;
    if (lastDip && prevDip) {
      const projected =
        prevDip.levelMl + sumBetween(delivs, prevDip.ts, lastDip.ts) - sumBetween(sales, prevDip.ts, lastDip.ts);
      variancePct = wetStockVariancePct(lastDip.levelMl, projected);
    }

    const levelMl = lastDip
      ? Math.max(
          0,
          lastDip.levelMl + sumBetween(delivs, lastDip.ts, now) - sumBetween(sales, lastDip.ts, now),
        )
      : Math.round(tank.capacityMl * 0.5);

    const pct = (levelMl / tank.capacityMl) * 100;
    const stockStatus: TankStat["stockStatus"] = !lastDip
      ? "unknown"
      : pct <= tank.criticalLevelPct
        ? "critical"
        : pct <= tank.safeLevelPct
          ? "low"
          : "ok";

    stats.push({
      tankId: tank.id,
      stationId: tank.stationId,
      productCode: tank.productCode,
      name: tank.name,
      stationName: stationName.get(tank.stationId) ?? tank.stationId,
      capacityMl: tank.capacityMl,
      levelMl,
      pct,
      safeLevelPct: tank.safeLevelPct,
      criticalLevelPct: tank.criticalLevelPct,
      dipMl: lastDip?.levelMl,
      lastDipTs: lastDip?.ts,
      variancePct,
      stockStatus,
    });
  }
  return stats;
}
