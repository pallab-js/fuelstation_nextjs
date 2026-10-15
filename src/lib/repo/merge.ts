/**
 * Pure merge engine for reconciling two local snapshots of a table (e.g. the
 * current DB vs. an imported backup, or — in future — a pulled remote delta).
 *
 * This is the conflict-resolution core of the planned sync feature, built
 * independently of any transport so it is fully unit-testable and reusable by
 * whatever sync mechanism is chosen later. It performs NO I/O.
 *
 * Strategy (per-entity, documented in docs/ roadmap as option B):
 *  - Append-only ledgers (sales, creditTxns, dips, deliveries, expenses,
 *    deposits, reconciliations, auditLog): UNION by key. These rows are never
 *    mutated after creation, so a key collision means the same event — we keep
 *    one copy (preferring the higher `updatedAt`, which should be identical).
 *  - Mutable rows (stations, staff, products, tanks, customers, settings, …):
 *    LAST-WRITE-WINS by `updatedAt`. The row with the newer timestamp wins; the
 *    older is discarded.
 *
 * Both strategies are commutative and idempotent on `(key, updatedAt)`, so
 * merging the same pair of snapshots repeatedly or in either order yields the
 * same result — a prerequisite for a correct eventual-sync layer.
 */

export type MergeStrategy = "ledger" | "lww";

export interface MergeRow {
  updatedAt?: number;
  [field: string]: unknown;
}

export interface MergeStats {
  added: number;
  updated: number;
  kept: number;
  conflicts: number;
}

export interface MergeResult<T> {
  rows: T[];
  stats: MergeStats;
}

/**
 * Merge `incoming` into `base`, keyed by `keyOf`. Deterministic and order-
 * independent. `base` represents the authoritative-so-far set (e.g. local DB).
 */
export function mergeRows<T extends MergeRow>(
  base: T[],
  incoming: T[],
  strategy: MergeStrategy,
  keyOf: (row: T) => string,
): MergeResult<T> {
  const byKey = new Map<string, T>();
  const stats: MergeStats = { added: 0, updated: 0, kept: 0, conflicts: 0 };

  for (const row of base) byKey.set(keyOf(row), row);

  for (const row of incoming) {
    const key = keyOf(row);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, row);
      stats.added++;
      continue;
    }

    // Key collision — resolve by strategy.
    stats.conflicts++;
    if (strategy === "ledger") {
      // Append-only: same key = same immutable event. Keep the higher
      // updatedAt deterministically; default to the existing (base) copy.
      if (ts(row) > ts(existing)) {
        byKey.set(key, row);
        stats.updated++;
      } else {
        stats.kept++;
      }
    } else {
      // LWW: newer updatedAt wins. Ties resolve to the existing base row so the
      // merge is deterministic regardless of argument order.
      if (ts(row) > ts(existing)) {
        byKey.set(key, row);
        stats.updated++;
      } else {
        stats.kept++;
      }
    }
  }

  return { rows: [...byKey.values()], stats };
}

function ts(row: MergeRow): number {
  return typeof row.updatedAt === "number" ? row.updatedAt : 0;
}

/**
 * Which merge strategy applies to a given table. Append-only ledgers union;
 * everything else is last-write-wins. Centralised so master.ts and any future
 * sync layer agree on the policy.
 */
const LEDGER_TABLES = new Set<string>([
  "sales",
  "creditTxns",
  "dips",
  "deliveries",
  "expenses",
  "deposits",
  "reconciliations",
  "auditLog",
]);

export function strategyFor(table: string): MergeStrategy {
  return LEDGER_TABLES.has(table) ? "ledger" : "lww";
}

/** Primary key field for a table — `settings` is keyed by `key`, all else `id`. */
export function keyFieldFor(table: string): "key" | "id" {
  return table === "settings" ? "key" : "id";
}
