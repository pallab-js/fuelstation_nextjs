import { describe, expect, it } from "vitest";
import { sequenceStep } from "./common";
import { receiptNo } from "@/lib/domain/format";

describe("sequenceStep", () => {
  it("seeds from baseline on first use (no stored value)", () => {
    // 4000 pre-existing sales → first allocated receipt is 4001, not 1
    expect(sequenceStep(undefined, 4000)).toBe(4001);
  });

  it("ignores baseline once a value is stored", () => {
    expect(sequenceStep(4001, 4000)).toBe(4002);
  });

  it("increments monotonically", () => {
    let v: number = sequenceStep(undefined);
    expect(v).toBe(1);
    v = sequenceStep(v);
    v = sequenceStep(v);
    expect(v).toBe(3);
  });

  it("treats a non-numeric stored value as unset and falls back to baseline", () => {
    expect(sequenceStep("corrupt", 10)).toBe(11);
    expect(sequenceStep(null, 0)).toBe(1);
  });

  it("never mints the same number twice across a simulated run", () => {
    // Mimics the atomic read-step-write loop a transaction serializes.
    let stored: number | undefined;
    const issued: number[] = [];
    for (let i = 0; i < 50; i++) {
      const n = sequenceStep(stored, 100);
      stored = n;
      issued.push(n);
    }
    expect(new Set(issued).size).toBe(issued.length); // all unique
    expect(issued[0]).toBe(101);
    expect(issued.at(-1)).toBe(150);
  });

  it("produces continuous, zero-padded receipt numbers", () => {
    expect(receiptNo(sequenceStep(900))).toBe("R-000901");
  });
});
