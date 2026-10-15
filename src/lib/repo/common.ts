import { db } from "@/lib/db/dexie";
import type { AuditEntry } from "@/lib/db/types";

export function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}${Date.now().toString(36).slice(-4)}`;
}

export async function audit(
  staffId: string,
  action: string,
  entity: string,
  entityId: string,
  summary: string,
): Promise<void> {
  const row: AuditEntry = {
    id: uid("au"),
    ts: Date.now(),
    staffId,
    action,
    entity,
    entityId,
    summary,
    updatedAt: Date.now(),
  };
  await db.auditLog.add(row);
}

/**
 * Pure counter step: given the stored value (or undefined on first use) and a
 * baseline, return the next value. Monotonic; seeds from `baseline` only when
 * no value has been stored yet. Extracted so the increment logic is unit-tested
 * without an IndexedDB backend.
 */
export function sequenceStep(stored: unknown, baseline = 0): number {
  const current = typeof stored === "number" ? stored : baseline;
  return current + 1;
}

/**
 * Atomically allocate the next value of a named monotonic counter.
 *
 * MUST be called inside a Dexie `rw` transaction that includes `db.settings`
 * in its scope. Reading `table.count()` and then writing `count + 1` outside a
 * transaction races under concurrent writes (two tabs, a double-submit) and can
 * mint duplicate receipt/voucher numbers — a correctness defect for financial
 * records. Routing the increment through a single counter row inside the same
 * transaction as the dependent insert makes allocation serial and collision-free.
 *
 * On first use the counter is seeded from `baseline` (a count of pre-existing
 * rows), so numbering continues from where previously count-derived IDs left
 * off rather than restarting at 1.
 */
export async function nextSequence(name: string, baseline = 0): Promise<number> {
  const key = `seq.${name}`;
  const row = await db.settings.get(key);
  const next = sequenceStep(row?.value, baseline);
  await db.settings.put({ key, value: next });
  return next;
}

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}
