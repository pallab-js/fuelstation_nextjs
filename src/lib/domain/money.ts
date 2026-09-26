/** Integer money (paise) & volume (millilitres) helpers — no floats in storage. */

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function litresToMl(litres: number): number {
  return Math.round(litres * 1000);
}

export function mlToLitres(ml: number): number {
  return ml / 1000;
}

/** split amount into parts as evenly as possible (integers, sum === total) */
export function splitEvenly(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const rem = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < rem ? 1 : 0));
}
