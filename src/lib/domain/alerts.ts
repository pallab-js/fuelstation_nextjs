import type {
  Alert,
  AlertSeverity,
  AlertType,
  CreditTxn,
  Reconciliation,
  RetailItem,
  Shift,
  Station,
} from "@/lib/db/types";
import { balanceOf, oldestDueTs } from "./aging";
import { date } from "./format";
import type { TankStat } from "./tanks";

export type { TankStat };

export interface CreditStat {
  customerId: string;
  name: string;
  balancePaise: number;
  limitPaise: number;
  txns: CreditTxn[];
}

export interface AlertInput {
  now: number;
  stations: Station[];
  tankStats: TankStat[];
  openShifts: Shift[];
  staffNames: Record<string, string>;
  recons: Reconciliation[];
  creditStats: CreditStat[];
  retailItems: RetailItem[];
}

function mk(
  type: AlertType,
  severity: AlertSeverity,
  refId: string,
  stationId: string | null,
  ts: number,
  title: string,
  message: string,
  now: number,
): Alert {
  return {
    id: `${type}:${refId}`,
    type,
    severity,
    refId,
    stationId,
    ts,
    title,
    message,
    acked: false,
    updatedAt: now,
  };
}

const DAY = 86_400_000;

/** Pure evaluator — deterministic ids make alert rows idempotent/upsertable. */
export function evaluateAlerts(input: AlertInput): Alert[] {
  const { now } = input;
  const out: Alert[] = [];
  const stationName = (id: string | null) =>
    input.stations.find((s) => s.id === id)?.name ?? "Network";

  // --- tanks ---
  for (const t of input.tankStats) {
    const label = `${stationName(t.stationId)} · ${t.name}`;
    if (t.pct <= t.criticalLevelPct) {
      out.push(
        mk(
          "critical-stock",
          "critical",
          t.tankId,
          t.stationId,
          now,
          `Critical fuel level — ${t.name}`,
          `${label} at ${t.pct.toFixed(0)}% of capacity (critical ≤ ${t.criticalLevelPct}%). Schedule a delivery.`,
          now,
        ),
      );
    } else if (t.pct <= t.safeLevelPct) {
      out.push(
        mk(
          "low-stock",
          "warning",
          t.tankId,
          t.stationId,
          now,
          `Low fuel level — ${t.name}`,
          `${label} at ${t.pct.toFixed(0)}% of capacity (safe ≥ ${t.safeLevelPct}%).`,
          now,
        ),
      );
    }
    if (t.variancePct !== undefined && Math.abs(t.variancePct) > 0.5) {
      const critical = Math.abs(t.variancePct) > 1;
      out.push(
        mk(
          "wet-stock-variance",
          critical ? "critical" : "warning",
          t.tankId,
          t.stationId,
          now,
          `Wet-stock variance — ${t.name}`,
          `${label}: dip differs from book stock by ${t.variancePct > 0 ? "+" : ""}${t.variancePct.toFixed(2)}%.`,
          now,
        ),
      );
    }
  }

  // --- open shifts ---
  for (const s of input.openShifts) {
    if (now - s.openTs > 10 * 3_600_000) {
      out.push(
        mk(
          "shift-open-long",
          "warning",
          s.id,
          s.stationId,
          now,
          `${s.name} shift open too long`,
          `${stationName(s.stationId)}: ${s.name} shift opened ${Math.round((now - s.openTs) / 3_600_000)} h ago (attendant: ${input.staffNames[s.staffId] ?? "—"}).`,
          now,
        ),
      );
    }
  }

  // --- cash variances ---
  for (const r of input.recons) {
    if (r.status === "short") {
      out.push(
        mk(
          "cash-short",
          "critical",
          r.id,
          r.stationId,
          r.ts,
          `Cash shortage at ${stationName(r.stationId)}`,
          `Short by ₹${Math.abs(r.variancePaise / 100).toFixed(0)} on a shift closed ${date(r.ts)}.`,
          r.ts,
        ),
      );
    } else if (r.status === "over") {
      out.push(
        mk(
          "cash-short",
          "info",
          r.id,
          r.stationId,
          r.ts,
          `Cash overage at ${stationName(r.stationId)}`,
          `Over by ₹${(r.variancePaise / 100).toFixed(0)} — check for unrecorded sale.`,
          r.ts,
        ),
      );
    }
  }

  // --- credit ---
  for (const c of input.creditStats) {
    if (c.limitPaise > 0 && c.balancePaise > c.limitPaise) {
      out.push(
        mk(
          "credit-limit",
          "critical",
          c.customerId,
          null,
          now,
          `Credit limit exceeded — ${c.name}`,
          `Balance ₹${Math.round(c.balancePaise / 100).toLocaleString("en-IN")} vs limit ₹${Math.round(c.limitPaise / 100).toLocaleString("en-IN")}.`,
          now,
        ),
      );
    }
    const oldest = oldestDueTs(c.txns, now);
    if (oldest !== null && now - oldest > 7 * DAY) {
      out.push(
        mk(
          "credit-overdue",
          "warning",
          c.customerId,
          null,
          now,
          `Overdue credit — ${c.name}`,
          `Oldest unpaid charge is ${Math.floor((now - oldest) / DAY)} days past due (balance ₹${Math.round(balanceOf(c.txns) / 100).toLocaleString("en-IN")}).`,
          now,
        ),
      );
    }
  }

  // --- retail stock ---
  for (const item of input.retailItems) {
    if (item.stockQty <= item.lowStockAt) {
      out.push(
        mk(
          "low-retail-stock",
          "info",
          item.id,
          item.stationId,
          now,
          `Low shop stock — ${item.name}`,
          `${item.stockQty} ${item.unit} left at ${stationName(item.stationId)} (reorder at ${item.lowStockAt}).`,
          now,
        ),
      );
    }
  }

  return out;
}
