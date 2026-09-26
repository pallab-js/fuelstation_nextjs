import { describe, expect, it } from "vitest";
import { agingOf, balanceOf, oldestDueTs } from "./aging";
import type { CreditTxn } from "@/lib/db/types";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

function txn(partial: Partial<CreditTxn> & Pick<CreditTxn, "id" | "ts" | "type" | "amountPaise">): CreditTxn {
  return {
    customerId: "cu_1",
    method: "credit",
    staffId: "us_meera",
    updatedAt: partial.ts,
    ...partial,
  } as CreditTxn;
}

describe("balanceOf", () => {
  it("sums charges and subtracts payments", () => {
    const txns = [
      txn({ id: "a", ts: NOW - 40 * DAY, type: "charge", amountPaise: 100_000 }),
      txn({ id: "b", ts: NOW - 30 * DAY, type: "charge", amountPaise: 50_000 }),
      txn({ id: "c", ts: NOW - 10 * DAY, type: "payment", amountPaise: 120_000 }),
      txn({ id: "d", ts: NOW - 5 * DAY, type: "adjustment", amountPaise: 10_000 }),
    ];
    expect(balanceOf(txns)).toBe(40_000);
  });
});

describe("agingOf", () => {
  it("keeps not-yet-due charges in current", () => {
    const txns = [txn({ id: "a", ts: NOW - 2 * DAY, type: "charge", amountPaise: 10_000, dueTs: NOW + 10 * DAY })];
    const a = agingOf(txns, NOW);
    expect(a.current).toBe(10_000);
    expect(a.overdue).toBe(0);
    expect(a.total).toBe(10_000);
  });

  it("buckets past-due charges and applies payments FIFO", () => {
    const txns = [
      txn({ id: "old", ts: NOW - 70 * DAY, type: "charge", amountPaise: 40_000, dueTs: NOW - 55 * DAY }),
      txn({ id: "mid", ts: NOW - 40 * DAY, type: "charge", amountPaise: 30_000, dueTs: NOW - 25 * DAY }),
      txn({ id: "pay", ts: NOW - 20 * DAY, type: "payment", amountPaise: 40_000 }),
    ];
    const a = agingOf(txns, NOW);
    expect(a.total).toBe(30_000);
    expect(a.d60).toBe(0); // old charge fully consumed by payment
    expect(a.d30).toBe(30_000);
    expect(a.overdue).toBe(30_000);
  });

  it("routes 90+ day overdue into the top bucket", () => {
    const txns = [txn({ id: "x", ts: NOW - 130 * DAY, type: "charge", amountPaise: 20_000, dueTs: NOW - 120 * DAY })];
    const a = agingOf(txns, NOW);
    expect(a.d90plus).toBe(20_000);
  });
});

describe("oldestDueTs", () => {
  it("returns null when everything is paid", () => {
    const txns = [
      txn({ id: "a", ts: NOW - 60 * DAY, type: "charge", amountPaise: 10_000, dueTs: NOW - 45 * DAY }),
      txn({ id: "b", ts: NOW - 40 * DAY, type: "payment", amountPaise: 10_000 }),
    ];
    expect(oldestDueTs(txns, NOW)).toBeNull();
  });

  it("returns the oldest unpaid due date", () => {
    const due = NOW - 45 * DAY;
    const txns = [txn({ id: "a", ts: NOW - 60 * DAY, type: "charge", amountPaise: 10_000, dueTs: due })];
    expect(oldestDueTs(txns, NOW)).toBe(due);
  });
});
