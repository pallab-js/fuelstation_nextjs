import { z } from "zod";

/**
 * Runtime validation for backup files (M2): a corrupt or foreign file must
 * never wipe/replace the database with malformed rows. Every table row needs
 * a string id; critical tables get tighter field checks.
 *
 * Pure module (no Dexie imports) so it stays unit-testable; `master.ts`
 * converts failures into DomainError.
 */

const baseRow = z.object({ id: z.string().min(1) }).passthrough();

const staffRow = baseRow.extend({
  role: z.enum(["owner", "manager", "attendant"]),
  active: z.boolean(),
  pinHash: z.string(),
  pinSalt: z.string(),
});

const shiftRow = baseRow.extend({
  status: z.enum(["open", "closed"]),
  stationId: z.string(),
  staffId: z.string(),
  openTs: z.number(),
});

const saleRow = baseRow.extend({
  kind: z.enum(["fuel", "retail"]),
  payment: z.enum(["cash", "upi", "card", "credit"]),
  stationId: z.string(),
  ts: z.number(),
});

const stationRow = baseRow.extend({
  code: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(["active", "inactive"]),
});

const tableSchemas: Record<string, z.ZodType> = {
  staff: z.array(staffRow),
  shifts: z.array(shiftRow),
  sales: z.array(saleRow),
  stations: z.array(stationRow),
};

const backupSchema = z.object({
  app: z.literal("fuelops"),
  version: z.number().int().positive(),
  exportedAt: z.number(),
  tables: z.record(z.string(), z.array(baseRow)),
});

export type ParsedBackup = z.infer<typeof backupSchema>;

export type ParseResult =
  | { ok: true; data: ParsedBackup; tableNames: string[] }
  | { ok: false; error: string };

/** Validate an untrusted backup file. Never throws. */
export function parseBackup(input: unknown): ParseResult {
  const envelope = backupSchema.safeParse(input);
  if (!envelope.success) {
    const issue = envelope.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ${issue.message}` : "not a FuelOps backup file";
    return { ok: false, error: `Invalid backup — ${where}` };
  }
  const tables = envelope.data.tables;
  for (const [name, schema] of Object.entries(tableSchemas)) {
    const rows = tables[name];
    if (!rows) continue;
    const parsed = (schema as z.ZodArray<z.ZodType>).safeParse(rows);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const rowIdx = issue?.path[0];
      return {
        ok: false,
        error: `Invalid backup — table "${name}" row ${typeof rowIdx === "number" ? rowIdx : "?"}: ${issue?.message ?? "bad row"}`,
      };
    }
  }
  const tableNames = Object.keys(tables);
  if (tableNames.length === 0) return { ok: false, error: "Backup contains no table data." };
  return { ok: true, data: envelope.data, tableNames };
}
