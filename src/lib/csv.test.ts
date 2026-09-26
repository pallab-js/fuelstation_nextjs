import { describe, expect, it } from "vitest";
import { safeCell } from "./csv";

describe("safeCell (CSV formula-injection guard)", () => {
  it("neutralizes formula prefixes", () => {
    expect(safeCell("=1+1")).toBe('"\'=1+1"');
    expect(safeCell("+SUM(A1)")).toBe('"\'+SUM(A1)"');
    expect(safeCell("-2+3")).toBe('"\'-2+3"');
    expect(safeCell("@cmd")).toBe('"\'@cmd"');
    expect(safeCell("\tTAB")).toBe('"\'\tTAB"');
  });

  it("leaves normal values untouched", () => {
    expect(safeCell("Sharma Fuel Hub")).toBe('"Sharma Fuel Hub"');
    expect(safeCell(1234)).toBe('"1234"');
    expect(safeCell(-500)).toBe('"\'-500"'); // negative numbers still guarded, read as text
  });

  it("escapes quotes", () => {
    expect(safeCell('He said "hi"')).toBe('"He said ""hi"""');
  });
});
