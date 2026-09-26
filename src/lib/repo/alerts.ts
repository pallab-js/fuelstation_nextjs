import { db } from "@/lib/db/dexie";
import { evaluateAlerts } from "@/lib/domain/alerts";
import { computeTankStats } from "@/lib/domain/tanks";
import { balanceOf } from "@/lib/domain/aging";

/**
 * Re-evaluates the full alert set from current rows and upserts it.
 * Alert ids are deterministic, so rows are idempotent; acked flags survive.
 */
export async function syncAlerts(now = Date.now()): Promise<void> {
  const [
    stations,
    tanks,
    dips,
    deliveries,
    sales,
    shifts,
    recons,
    customers,
    accounts,
    txns,
    items,
    staff,
    existing,
  ] = await Promise.all([
    db.stations.toArray(),
    db.tanks.toArray(),
    db.dips.toArray(),
    db.deliveries.toArray(),
    db.sales.toArray(),
    db.shifts.toArray(),
    db.reconciliations.toArray(),
    db.customers.toArray(),
    db.creditAccounts.toArray(),
    db.creditTxns.toArray(),
    db.retailItems.toArray(),
    db.staff.toArray(),
    db.alerts.toArray(),
  ]);

  const tankStats = computeTankStats({ stations, tanks, dips, deliveries, sales, now });
  const staffNames = Object.fromEntries(staff.map((s) => [s.id, s.name]));
  const creditStats = customers.map((c) => {
    const cTxns = txns.filter((t) => t.customerId === c.id);
    return {
      customerId: c.id,
      name: c.name,
      balancePaise: balanceOf(cTxns),
      limitPaise: accounts.find((a) => a.customerId === c.id)?.creditLimitPaise ?? 0,
      txns: cTxns,
    };
  });

  const evaluated = evaluateAlerts({
    now,
    stations,
    tankStats,
    openShifts: shifts.filter((s) => s.status === "open"),
    staffNames,
    recons: recons.filter((r) => r.status !== "ok" && r.ts >= now - 7 * 86_400_000).slice(-60),
    creditStats,
    retailItems: items.filter((r) => r.stockQty <= r.lowStockAt),
  });

  const prev = new Map(existing.map((a) => [a.id, a]));
  const keep = new Set(evaluated.map((a) => a.id));

  await db.transaction("rw", db.alerts, async () => {
    for (const alert of evaluated) {
      const old = prev.get(alert.id);
      await db.alerts.put(old?.acked ? { ...alert, acked: true } : alert);
    }
    for (const old of existing) {
      if (!keep.has(old.id)) await db.alerts.delete(old.id);
    }
  });
}

export async function ackAlert(id: string): Promise<void> {
  const row = await db.alerts.get(id);
  if (row) await db.alerts.put({ ...row, acked: true, updatedAt: Date.now() });
}

export async function ackAll(): Promise<void> {
  const rows = (await db.alerts.toArray()).filter((a) => !a.acked);
  await db.transaction("rw", db.alerts, async () => {
    for (const row of rows) await db.alerts.put({ ...row, acked: true, updatedAt: Date.now() });
  });
}
