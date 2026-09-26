const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrCompact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});

const inrPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const num = new Intl.NumberFormat("en-IN");

/** ₹ formatted from paise */
export function money(paise: number, opts?: { compact?: boolean; exact?: boolean }): string {
  if (opts?.exact) return inrPaise.format(paise / 100);
  if (opts?.compact) return inrCompact.format(paise / 100);
  return inr.format(paise / 100);
}

/** Compact KPI money: ₹1.2Cr / ₹4.8L / ₹9.4k */
export function moneyShort(paise: number): string {
  return inrCompact.format(paise / 100);
}

/** Litres from ml — "1,234 L" / "12.5 L" */
export function litres(ml: number, opts?: { precise?: boolean }): string {
  const l = ml / 1000;
  if (opts?.precise || Math.abs(l) < 1000) {
    return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(l)} L`;
  }
  return `${num.format(Math.round(l))} L`;
}

export function count(n: number): string {
  return num.format(n);
}

export function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function signedMoney(paise: number): string {
  const v = money(Math.abs(paise));
  return paise < 0 ? `−${v}` : paise > 0 ? `+${v}` : v;
}

export function signedPct(n: number, digits = 2): string {
  const s = n.toFixed(digits);
  return n > 0 ? `+${s}%` : `${s}%`;
}

const dtf = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const dtfShort = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" });
const timef = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
const fullf = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

export function date(ts: number): string {
  return dtf.format(ts);
}

export function dateShort(ts: number): string {
  return dtfShort.format(ts);
}

export function time(ts: number): string {
  return timef.format(ts);
}

export function dateTime(ts: number): string {
  return fullf.format(ts);
}

export function relative(ts: number, now = Date.now()): string {
  const diff = now - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return dateShort(ts);
}

export function receiptNo(n: number): string {
  return `R-${String(n).padStart(6, "0")}`;
}
