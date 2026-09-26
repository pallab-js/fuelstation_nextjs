export type RangePreset = "today" | "7d" | "30d" | "90d";

const DAY = 86_400_000;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(ts: number): number {
  return startOfDay(ts) + DAY - 1;
}

export function addDays(ts: number, days: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Local YYYY-MM-DD key used for daily bucketing */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function rangeFor(preset: RangePreset, now = Date.now()): { from: number; to: number } {
  const today = startOfDay(now);
  switch (preset) {
    case "today":
      return { from: today, to: endOfDay(now) };
    case "7d":
      return { from: addDays(today, -6), to: endOfDay(now) };
    case "30d":
      return { from: addDays(today, -29), to: endOfDay(now) };
    case "90d":
      return { from: addDays(today, -89), to: endOfDay(now) };
  }
}

/** inclusive list of day keys between from/to (max 400 buckets) */
export function dayKeys(from: number, to: number, max = 400): string[] {
  const keys: string[] = [];
  let ts = startOfDay(from);
  const end = startOfDay(to);
  while (ts <= end && keys.length < max) {
    keys.push(dayKey(ts));
    ts = addDays(ts, 1);
  }
  return keys;
}

export const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function isLongOpen(openTs: number, now = Date.now(), hours = 10): boolean {
  return now - openTs > hours * 3_600_000;
}
