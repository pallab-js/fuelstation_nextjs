import { db } from "@/lib/db/dexie";
import type { Staff, Station } from "@/lib/db/types";
import { hashPin, randomSalt } from "@/lib/db/pin";
import { audit, DomainError } from "./common";

/* -------------------------------- stations ------------------------------ */

export async function setStationTolerance(input: {
  stationId: string;
  tolerancePaise: number;
  staffId: string;
}): Promise<void> {
  if (input.tolerancePaise < 0) throw new DomainError("Tolerance cannot be negative.");
  const station = await db.stations.get(input.stationId);
  if (!station) throw new DomainError("Station not found.");
  await db.stations.put({ ...station, tolerancePaise: input.tolerancePaise, updatedAt: Date.now() });
  await audit(input.staffId, "station.tolerance", "station", station.id, `₹${input.tolerancePaise / 100} tolerance`);
}

export async function setStationStatus(input: {
  stationId: string;
  status: Station["status"];
  staffId: string;
}): Promise<void> {
  const station = await db.stations.get(input.stationId);
  if (!station) throw new DomainError("Station not found.");
  await db.stations.put({ ...station, status: input.status, updatedAt: Date.now() });
  await audit(input.staffId, "station.status", "station", station.id, input.status);
}

/* --------------------------------- staff -------------------------------- */

export async function setStaffPin(input: { staffId: string; pin: string; staffIdActor: string }): Promise<void> {
  if (!/^\d{4,6}$/.test(input.pin)) throw new DomainError("PIN must be 4–6 digits.");
  const member = await db.staff.get(input.staffId);
  if (!member) throw new DomainError("Staff member not found.");
  const salt = randomSalt();
  const pinHash = await hashPin(input.pin, salt);
  await db.staff.put({ ...member, pinSalt: salt, pinHash, updatedAt: Date.now() });
  await audit(input.staffIdActor, "staff.pin", "staff", member.id, `PIN reset for ${member.name}`);
}

export async function setStaffActive(input: {
  staffId: string;
  active: boolean;
  staffIdActor: string;
}): Promise<void> {
  const member = await db.staff.get(input.staffId);
  if (!member) throw new DomainError("Staff member not found.");
  await db.staff.put({ ...member, active: input.active, updatedAt: Date.now() });
  await audit(input.staffIdActor, "staff.active", "staff", member.id, input.active ? "activated" : "deactivated");
}

/* -------------------------------- backup -------------------------------- */

const TABLES = [
  "stations",
  "staff",
  "products",
  "pumps",
  "nozzles",
  "tanks",
  "dips",
  "deliveries",
  "shifts",
  "sales",
  "reconciliations",
  "customers",
  "creditAccounts",
  "vehicles",
  "creditTxns",
  "expenses",
  "deposits",
  "retailItems",
  "alerts",
  "auditLog",
  "settings",
] as const;

export interface Backup {
  app: "fuelops";
  version: number;
  exportedAt: number;
  tables: Record<string, unknown[]>;
}

export async function exportBackup(): Promise<Backup> {
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) tables[t] = await db.table(t).toArray();
  return { app: "fuelops", version: 1, exportedAt: Date.now(), tables };
}

export async function importBackup(backup: Backup, staffId: string): Promise<void> {
  if (backup?.app !== "fuelops" || !backup.tables) throw new DomainError("Not a FuelOps backup file.");
  await db.transaction("rw", TABLES, async () => {
    for (const t of TABLES) {
      const rows = (backup.tables[t] ?? []) as { id?: string; key?: string }[];
      if (!Array.isArray(rows)) continue;
      const table = db.table(t);
      await table.clear();
      if (rows.length) await table.bulkPut(rows as never[]);
    }
  });
  await audit(staffId, "backup.import", "system", "backup", `imported ${backup.exportedAt}`);
}

export function downloadBackup(backup: Backup): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fuelops-backup-${new Date(backup.exportedAt).toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type { Staff };
