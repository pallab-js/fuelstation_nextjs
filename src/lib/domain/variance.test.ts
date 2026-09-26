import { describe, expect, it } from "vitest";
import {
  bookLevelMl,
  expectedCashPaise,
  paymentSplit,
  reconcile,
  wetStockVariancePct,
} from "./variance";

describe("expectedCashPaise", () => {
  it("adds sales and subtracts expenses/deposits", () => {
    expect(
      expectedCashPaise({
        openingCashPaise: 100_000,
        cashSalesPaise: 500_000,
        cashExpensesPaise: 40_000,
        depositsPaise: 300_000,
      }),
    ).toBe(260_000);
  });
});

describe("reconcile", () => {
  const base = {
    openingCashPaise: 100_000,
    cashSalesPaise: 500_000,
    cashExpensesPaise: 0,
    depositsPaise: 0,
    tolerancePaise: 10_000,
  };

  it("is ok within tolerance (both directions)", () => {
    expect(reconcile({ ...base, countedPaise: 600_000 }).status).toBe("ok");
    expect(reconcile({ ...base, countedPaise: 595_000 }).status).toBe("ok");
    expect(reconcile({ ...base, countedPaise: 605_000 }).status).toBe("ok");
  });

  it("flags short below −tolerance", () => {
    const r = reconcile({ ...base, countedPaise: 580_000 });
    expect(r.status).toBe("short");
    expect(r.variancePaise).toBe(-20_000);
    expect(r.expectedPaise).toBe(600_000);
  });

  it("flags over above +tolerance", () => {
    const r = reconcile({ ...base, countedPaise: 650_000 });
    expect(r.status).toBe("over");
    expect(r.variancePaise).toBe(50_000);
  });
});

describe("paymentSplit", () => {
  it("splits amounts by payment method", () => {
    const rows = [
      { amountPaise: 100, payment: "cash" as const },
      { amountPaise: 200, payment: "upi" as const },
      { amountPaise: 50, payment: "cash" as const },
      { amountPaise: 700, payment: "credit" as const },
    ];
    expect(paymentSplit(rows)).toEqual({ cash: 150, upi: 200, card: 0, credit: 700 });
  });
});

describe("bookLevelMl / wetStockVariancePct", () => {
  it("computes book level from anchor + deliveries − sales", () => {
    const book = bookLevelMl({
      anchorLevelMl: 1_000_000,
      anchorTs: 1000,
      deliveries: [
        { ts: 900, volumeMl: 500_000 }, // before anchor — ignored
        { ts: 2000, volumeMl: 200_000 },
      ],
      salesMl: 300_000,
    });
    expect(book).toBe(900_000);
  });

  it("returns variance percentage signed by dip vs book", () => {
    expect(wetStockVariancePct(950_000, 1_000_000)).toBeCloseTo(-5);
    expect(wetStockVariancePct(1_050_000, 1_000_000)).toBeCloseTo(5);
    expect(wetStockVariancePct(500_000, 0)).toBe(0);
  });
});
