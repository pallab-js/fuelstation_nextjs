import { describe, expect, it } from "vitest";
import { parseBackup } from "./backup-schema";

const valid = {
  app: "fuelops",
  version: 1,
  exportedAt: Date.parse("2026-09-26T18:30:00"),
  tables: {
    stations: [{ id: "st_1", code: "X01", name: "Test", status: "active" }],
    staff: [
      {
        id: "us_1",
        name: "Anita",
        role: "owner",
        stationId: null,
        phone: "",
        pinSalt: "abc",
        pinHash: "def",
        active: true,
      },
    ],
    expenses: [{ id: "exp_1", amountPaise: 1000 }],
  },
};

describe("parseBackup", () => {
  it("accepts a valid backup", () => {
    const r = parseBackup(valid);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tableNames.sort()).toEqual(["expenses", "staff", "stations"]);
  });

  it("rejects non-FuelOps files", () => {
    expect(parseBackup({ app: "other" }).ok).toBe(false);
    expect(parseBackup(null).ok).toBe(false);
    expect(parseBackup("string").ok).toBe(false);
  });

  it("rejects rows without an id", () => {
    const r = parseBackup({ ...valid, tables: { expenses: [{ amountPaise: 5 }] } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("id");
  });

  it("rejects a forged staff role", () => {
    const bad = {
      ...valid,
      tables: { staff: [{ ...valid.tables.staff[0], role: "superuser" }] },
    };
    const r = parseBackup(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("staff");
  });

  it("rejects non-array table payloads", () => {
    expect(parseBackup({ ...valid, tables: { expenses: "nope" } }).ok).toBe(false);
  });

  it("rejects empty backups", () => {
    expect(parseBackup({ ...valid, tables: {} }).ok).toBe(false);
  });
});
