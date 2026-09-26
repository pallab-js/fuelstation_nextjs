import { describe, expect, it } from "vitest";
import { generateSeedDataset } from "@/lib/db/seed";

const NOW = Date.parse("2026-09-26T18:30:00");

describe("generateSeedDataset", () => {
  it("is deterministic for a fixed now + seed", async () => {
    const a = await generateSeedDataset(NOW, 42);
    const b = await generateSeedDataset(NOW, 42);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("differs across seeds", async () => {
    const a = await generateSeedDataset(NOW, 1);
    const b = await generateSeedDataset(NOW, 2);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("produces the expected demo shape", async () => {
    const ds = await generateSeedDataset(NOW);

    expect(ds.stations).toHaveLength(5);
    expect(ds.staff.length).toBeGreaterThanOrEqual(8);
    expect(ds.products.map((p) => p.code).sort()).toEqual(["DIESEL", "PETROL", "PREMIUM"]);

    expect(ds.shifts.length).toBeGreaterThan(1000);
    expect(ds.sales.length).toBeGreaterThan(4000);
    expect(ds.dips.length).toBeGreaterThan(1000);
    expect(ds.reconciliations.length).toBeGreaterThan(1000);

    // live shifts exist for demo (live-ops band)
    expect(ds.shifts.filter((s) => s.status === "open").length).toBeGreaterThanOrEqual(1);

    // every sale has a matching shift and non-zero amount
    const shiftIds = new Set(ds.shifts.map((s) => s.id));
    for (const s of ds.sales) {
      expect(shiftIds.has(s.shiftId)).toBe(true);
      expect(s.amountPaise).toBeGreaterThan(0);
      if (s.kind === "fuel") expect(s.quantityMl).toBeGreaterThan(0);
    }

    // planted cash-short scenario at RV-07 (2 days ago)
    const shorts = ds.reconciliations.filter((r) => r.status === "short");
    expect(shorts.length).toBeGreaterThanOrEqual(1);
    expect(shorts.some((r) => r.stationId === "st_rv07" && r.variancePaise === -185_000)).toBe(true);

    // ST-09 diesel tank is critical today (leak scenario)
    const alerts = ds.alerts;
    expect(alerts.some((a) => a.type === "critical-stock" && a.refId === "tk_st_st09_D")).toBe(true);

    // credit scenarios: limit breach + overdue exist
    expect(alerts.some((a) => a.type === "credit-limit")).toBe(true);
    expect(alerts.some((a) => a.type === "credit-overdue")).toBe(true);

    // no future timestamps
    const future = [...ds.sales, ...ds.shifts, ...ds.dips].filter((r) => r.updatedAt > NOW);
    expect(future).toHaveLength(0);
  }, 30_000);

  it("keeps the alert feed focused and scenarios planted", async () => {
    const ds = await generateSeedDataset(NOW);
    const st09 = ds.alerts.filter((a) => a.refId === "tk_st_st09_D").map((a) => a.type).sort();
    expect(st09).toEqual(["critical-stock", "wet-stock-variance"]);
    expect(ds.alerts.filter((a) => a.type === "low-retail-stock")).toHaveLength(1);
    expect(ds.alerts.length).toBeLessThanOrEqual(30);
    const cash = ds.alerts.filter((a) => a.type === "cash-short");
    expect(cash.every((a) => a.ts >= NOW - 7 * 86_400_000)).toBe(true);
    const low = ds.retailItems.filter((r) => r.stockQty <= r.lowStockAt);
    expect(low.map((r) => r.id)).toEqual(["ri_st_shf01_3"]);
  }, 30_000);

  it("pins demo staff with hashed PINs", async () => {
    const ds = await generateSeedDataset(NOW);
    for (const s of ds.staff) {
      expect(s.pinSalt).toBeTruthy();
      expect(s.pinHash).toMatch(/^[0-9a-f]{64}$/);
      expect(s.pinHash).not.toContain("1234");
    }
  }, 30_000);
});
