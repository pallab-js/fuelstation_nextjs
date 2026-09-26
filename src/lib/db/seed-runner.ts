import { db, isSeeded, markSeeded, SEED_VERSION } from "./dexie";
import { generateSeedDataset } from "./seed";
import type { SeedDataset } from "./types";

export interface SeedProgress {
  phase: "generating" | "writing" | "done";
  pct: number;
  label: string;
}

const DATASET_TABLES: (keyof SeedDataset)[] = [
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
];

async function writeDataset(ds: SeedDataset, onProgress?: (p: SeedProgress) => void) {
  const tableNames = db.tables.map((t) => t.name);
  await db.transaction("rw", tableNames, async () => {
    for (const name of tableNames) {
      await db.table(name).clear();
    }
    let i = 0;
    for (const key of DATASET_TABLES) {
      const rows = ds[key] as unknown[];
      await db.table(key as string).bulkPut(rows);
      i++;
      onProgress?.({
        phase: "writing",
        pct: Math.round((i / DATASET_TABLES.length) * 100),
        label: `Writing ${String(key)}…`,
      });
    }
    await markSeeded();
  });
}

export async function ensureSeeded(onProgress?: (p: SeedProgress) => void): Promise<void> {
  if (await isSeeded()) {
    onProgress?.({ phase: "done", pct: 100, label: "Ready" });
    return;
  }
  onProgress?.({ phase: "generating", pct: 5, label: "Generating 90 days of demo data…" });
  const ds = await generateSeedDataset(Date.now());
  onProgress?.({ phase: "writing", pct: 60, label: "Writing to local database…" });
  await writeDataset(ds, onProgress);
  onProgress?.({ phase: "done", pct: 100, label: "Ready" });
}

export async function resetAndSeed(onProgress?: (p: SeedProgress) => void): Promise<void> {
  onProgress?.({ phase: "generating", pct: 5, label: "Resetting demo data…" });
  const ds = await generateSeedDataset(Date.now());
  onProgress?.({ phase: "writing", pct: 60, label: "Writing to local database…" });
  await writeDataset(ds, onProgress);
  onProgress?.({ phase: "done", pct: 100, label: "Ready" });
}

export async function wipeDatabase(): Promise<void> {
  const tableNames = db.tables.map((t) => t.name);
  await db.transaction("rw", tableNames, async () => {
    for (const name of tableNames) await db.table(name).clear();
  });
}

export { SEED_VERSION };
