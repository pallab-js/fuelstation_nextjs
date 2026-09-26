import type { CreditTxn } from "@/lib/db/types";

export interface Aging {
  current: number;
  d30: number;
  d60: number;
  d90: number;
  d90plus: number;
  total: number;
  overdue: number;
}

const DAY = 86_400_000;

/** Outstanding balance for a customer (paise; charges positive, payments negative). */
export function balanceOf(txns: CreditTxn[]): number {
  return txns.reduce((sum, t) => {
    if (t.type === "payment") return sum - t.amountPaise;
    if (t.type === "adjustment") return sum + t.amountPaise;
    return sum + t.amountPaise;
  }, 0);
}

/**
 * Split unpaid charges into aging buckets by days past due.
 * Charges not yet due land in `current`.
 */
export function agingOf(txns: CreditTxn[], now = Date.now()): Aging {
  const unpaid = new Map<string, number>();
  const due = new Map<string, number>();

  const sorted = [...txns].sort((a, b) => a.ts - b.ts);
  for (const t of sorted) {
    if (t.type === "payment") {
      // consume oldest unpaid charges first
      let remaining = t.amountPaise;
      const keys = [...unpaid.keys()];
      for (const k of keys) {
        if (remaining <= 0) break;
        const bal = unpaid.get(k)!;
        const take = Math.min(bal, remaining);
        unpaid.set(k, bal - take);
        remaining -= take;
      }
    } else {
      unpaid.set(t.id, (unpaid.get(t.id) ?? 0) + t.amountPaise);
      if (t.dueTs) due.set(t.id, t.dueTs);
      else due.set(t.id, t.ts + 15 * DAY);
    }
  }

  const out: Aging = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0, overdue: 0 };
  for (const [id, amount] of unpaid) {
    if (amount <= 0) continue;
    const dueTs = due.get(id) ?? now;
    const overdueDays = Math.floor((now - dueTs) / DAY);
    out.total += amount;
    if (overdueDays <= 0) out.current += amount;
    else if (overdueDays <= 30) {
      out.d30 += amount;
      out.overdue += amount;
    } else if (overdueDays <= 60) {
      out.d60 += amount;
      out.overdue += amount;
    } else if (overdueDays <= 90) {
      out.d90 += amount;
      out.overdue += amount;
    } else {
      out.d90plus += amount;
      out.overdue += amount;
    }
  }
  return out;
}

export function oldestDueTs(txns: CreditTxn[], now = Date.now()): number | null {
  const unpaid = new Map<string, number>();
  const due = new Map<string, number>();
  const sorted = [...txns].sort((a, b) => a.ts - b.ts);
  for (const t of sorted) {
    if (t.type === "payment") {
      let remaining = t.amountPaise;
      for (const k of [...unpaid.keys()]) {
        if (remaining <= 0) break;
        const bal = unpaid.get(k)!;
        const take = Math.min(bal, remaining);
        unpaid.set(k, bal - take);
        remaining -= take;
      }
    } else {
      unpaid.set(t.id, (unpaid.get(t.id) ?? 0) + t.amountPaise);
      due.set(t.id, t.dueTs ?? t.ts + 15 * DAY);
    }
  }
  let oldest: number | null = null;
  for (const [id, amount] of unpaid) {
    if (amount <= 0) continue;
    const d = due.get(id)!;
    if (d < now && (oldest === null || d < oldest)) oldest = d;
  }
  return oldest;
}
