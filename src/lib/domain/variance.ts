import type { PaymentMethod, ReconStatus } from "@/lib/db/types";

/** Expected cash drawer at shift close. All inputs in paise. */
export function expectedCashPaise(input: {
  openingCashPaise: number;
  cashSalesPaise: number;
  cashExpensesPaise: number;
  depositsPaise: number;
}): number {
  return (
    input.openingCashPaise + input.cashSalesPaise - input.cashExpensesPaise - input.depositsPaise
  );
}

export function reconcile(input: {
  openingCashPaise: number;
  cashSalesPaise: number;
  cashExpensesPaise: number;
  depositsPaise: number;
  countedPaise: number;
  tolerancePaise: number;
}): { expectedPaise: number; variancePaise: number; status: ReconStatus } {
  const expected = expectedCashPaise(input);
  const variance = input.countedPaise - expected;
  const status: ReconStatus =
    Math.abs(variance) <= input.tolerancePaise ? "ok" : variance < 0 ? "short" : "over";
  return { expectedPaise: expected, variancePaise: variance, status };
}

export function paymentSplit<T extends { amountPaise: number; payment: PaymentMethod }>(
  rows: T[],
): Record<PaymentMethod, number> {
  const out: Record<PaymentMethod, number> = { cash: 0, upi: 0, card: 0, credit: 0 };
  for (const r of rows) out[r.payment] += r.amountPaise;
  return out;
}

/**
 * Wet-stock: book level from anchor dip + deliveries − sales since anchor.
 * Sales must already be filtered to this station+product, deliveries to this tank.
 */
export function bookLevelMl(input: {
  anchorLevelMl: number;
  anchorTs: number;
  deliveries: { ts: number; volumeMl: number }[];
  salesMl: number;
}): number {
  const delivered = input.deliveries
    .filter((d) => d.ts > input.anchorTs)
    .reduce((s, d) => s + d.volumeMl, 0);
  return input.anchorLevelMl + delivered - input.salesMl;
}

export function wetStockVariancePct(dipMl: number, bookMl: number): number {
  if (bookMl <= 0) return 0;
  return ((dipMl - bookMl) / bookMl) * 100;
}
