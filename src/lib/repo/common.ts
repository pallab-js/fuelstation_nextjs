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

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}
