import { describe, expect, it } from "vitest";
import { collectionsMix, kpis, trend, varianceByStation, leaderboard } from "./analytics";
import type { Sale, Station } from "@/lib/db/types";

function sale(partial: Partial<Sale>): Sale {
  return {
    id: partial.id ?? "s1",
    stationId: "st_a",
    shiftId: "sf_1",
    ts: partial.ts ?? Date.parse("2026-09-10T10:00:00"),
    kind: "fuel",
    productCode: "PETROL",
    quantityMl: 10_000,
    unitPricePaise: 10_000,
    amountPaise: 100_000,
    payment: "cash",
    attendantId: "us_imran",
    receiptNo: "R-1",
    updatedAt: 0,
    ...partial,
  } as Sale;
}

describe("kpis", () => {
  it("aggregates revenue, litres and cash", () => {
    const rows = [
      sale({}),
      sale({ id: "s2", kind: "retail", amountPaise: 50_000, quantityMl: undefined, payment: "upi" }),
      sale({ id: "s3", amountPaise: 200_000, quantityMl: 20_000, payment: "card" }),
    ];
    const k = kpis(rows);
    expect(k.revenuePaise).toBe(350_000);
    expect(k.fuelPaise).toBe(300_000);
    expect(k.retailPaise).toBe(50_000);
    expect(k.litresMl).toBe(30_000);
    expect(k.cashPaise).toBe(100_000);
    expect(k.salesCount).toBe(3);
  });
});

describe("collectionsMix", () => {
  it("computes shares", () => {
    const rows = [
      sale({ amountPaise: 750, payment: "cash" }),
      sale({ id: "s2", amountPaise: 250, payment: "upi" }),
    ];
    const m = collectionsMix(rows);
    expect(m.total).toBe(1000);
    expect(m.shares.cash).toBeCloseTo(0.75);
    expect(m.shares.upi).toBeCloseTo(0.25);
    expect(m.shares.card).toBe(0);
  });
});

describe("trend", () => {
  it("buckets by local day and fills gaps", () => {
    const from = Date.parse("2026-09-01T00:00:00");
    const to = Date.parse("2026-09-03T23:59:59");
    const rows = [
      sale({ ts: Date.parse("2026-09-01T09:00:00"), amountPaise: 100 }),
      sale({ id: "s2", ts: Date.parse("2026-09-01T20:00:00"), amountPaise: 200 }),
      sale({ id: "s3", ts: Date.parse("2026-09-03T12:00:00"), amountPaise: 400 }),
    ];
    const t = trend(rows, from, to);
    expect(t).toHaveLength(3);
    expect(t[0].revenuePaise).toBe(300);
    expect(t[1].revenuePaise).toBe(0);
    expect(t[2].revenuePaise).toBe(400);
    expect(t[0].litresMl).toBe(20_000);
  });
});

describe("varianceByStation + leaderboard", () => {
  it("groups variance and ranks by revenue", () => {
    const stations = [
      { id: "st_a", code: "A", name: "Alpha", tolerancePaise: 10000 } as Station,
      { id: "st_b", code: "B", name: "Beta", tolerancePaise: 10000 } as Station,
    ];
    const v = varianceByStation([
      { stationId: "st_a", variancePaise: -100 },
      { stationId: "st_a", variancePaise: -50 },
      { stationId: "st_b", variancePaise: 200 },
    ]);
    expect(v.st_a).toBe(-150);
    expect(v.st_b).toBe(200);

    const rows = leaderboard(stations, [sale({}), sale({ id: "s2", stationId: "st_b", amountPaise: 500_000 })], v);
    expect(rows[0].station.id).toBe("st_b");
    expect(rows[0].variancePaise).toBe(200);
  });
});
