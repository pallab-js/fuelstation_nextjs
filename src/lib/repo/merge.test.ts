import { describe, expect, it } from "vitest";
import { keyFieldFor, mergeRows, strategyFor } from "./merge";

type Row = { id: string; updatedAt?: number; v?: string };

const byId = (r: { id: string }) => r.id;
const sortIds = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe("strategyFor", () => {
  it("treats append-only ledgers as union", () => {
    for (const t of ["sales", "creditTxns", "dips", "deliveries", "expenses", "deposits", "reconciliations", "auditLog"]) {
      expect(strategyFor(t)).toBe("ledger");
    }
  });
  it("treats mutable tables as last-write-wins", () => {
    for (const t of ["stations", "staff", "products", "tanks", "customers", "settings", "retailItems"]) {
      expect(strategyFor(t)).toBe("lww");
    }
  });
});

describe("keyFieldFor", () => {
  it("keys settings by key, everything else by id", () => {
    expect(keyFieldFor("settings")).toBe("key");
    expect(keyFieldFor("sales")).toBe("id");
  });
});

describe("mergeRows — ledger (union)", () => {
  it("adds rows absent from base and keeps existing on collision", () => {
    const base: Row[] = [{ id: "a", updatedAt: 1 }];
    const incoming: Row[] = [{ id: "a", updatedAt: 1 }, { id: "b", updatedAt: 2 }];
    const { rows, stats } = mergeRows(base, incoming, "ledger", byId);
    expect(sortIds(rows)).toEqual(["a", "b"]);
    expect(stats.added).toBe(1);
    expect(stats.kept).toBe(1); // "a" collision, kept
    expect(stats.conflicts).toBe(1);
  });

  it("never drops ledger rows (union keeps everything from both sides)", () => {
    const base: Row[] = [{ id: "x", updatedAt: 10 }];
    const incoming: Row[] = [{ id: "y", updatedAt: 20 }];
    const { rows } = mergeRows(base, incoming, "ledger", byId);
    expect(sortIds(rows)).toEqual(["x", "y"]);
  });
});

describe("mergeRows — lww (last-write-wins)", () => {
  it("newer updatedAt wins on collision", () => {
    const base: Row[] = [{ id: "s1", updatedAt: 100, v: "old" }];
    const incoming: Row[] = [{ id: "s1", updatedAt: 200, v: "new" }];
    const { rows, stats } = mergeRows(base, incoming, "lww", byId);
    expect(rows).toHaveLength(1);
    expect(rows[0].v).toBe("new");
    expect(stats.updated).toBe(1);
  });

  it("older incoming loses to newer base", () => {
    const base: Row[] = [{ id: "s1", updatedAt: 200, v: "new" }];
    const incoming: Row[] = [{ id: "s1", updatedAt: 100, v: "old" }];
    const { rows, stats } = mergeRows(base, incoming, "lww", byId);
    expect(rows[0].v).toBe("new");
    expect(stats.kept).toBe(1);
  });

  it("ties resolve to the base row (deterministic)", () => {
    const base: Row[] = [{ id: "s1", updatedAt: 100, v: "base" }];
    const incoming: Row[] = [{ id: "s1", updatedAt: 100, v: "incoming" }];
    const { rows } = mergeRows(base, incoming, "lww", byId);
    expect(rows[0].v).toBe("base");
  });
});

describe("mergeRows — algebraic properties", () => {
  const base: Row[] = [
    { id: "a", updatedAt: 1, v: "a1" },
    { id: "b", updatedAt: 5, v: "b5" },
  ];
  const incoming: Row[] = [
    { id: "b", updatedAt: 9, v: "b9" }, // newer → wins under lww
    { id: "c", updatedAt: 2, v: "c2" },
  ];

  it("is idempotent: merging the result again changes nothing", () => {
    const first = mergeRows(base, incoming, "lww", byId).rows;
    const second = mergeRows(first, incoming, "lww", byId).rows;
    expect(sortIds(second)).toEqual(sortIds(first));
    const bFirst = first.find((r) => r.id === "b")!;
    const bSecond = second.find((r) => r.id === "b")!;
    expect(bSecond.v).toBe(bFirst.v);
  });

  it("is order-independent on the winning value (commutative up to key set)", () => {
    const ab = mergeRows(base, incoming, "lww", byId).rows;
    const ba = mergeRows(incoming, base, "lww", byId).rows;
    expect(sortIds(ab)).toEqual(sortIds(ba));
    // "b" (updatedAt 9) must win regardless of argument order
    expect(ab.find((r) => r.id === "b")!.v).toBe("b9");
    expect(ba.find((r) => r.id === "b")!.v).toBe("b9");
  });

  it("ledger union is order-independent on the key set", () => {
    const ab = mergeRows(base, incoming, "ledger", byId).rows;
    const ba = mergeRows(incoming, base, "ledger", byId).rows;
    expect(sortIds(ab)).toEqual(sortIds(ba));
    expect(sortIds(ab)).toEqual(["a", "b", "c"]);
  });
});
