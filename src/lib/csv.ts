/**
 * CSV export with Excel/LibreOffice formula-injection protection (CWE-1236):
 * cells starting with = + - @ TAB or CR are prefixed with an apostrophe so
 * spreadsheets treat them as text instead of executing them.
 */
export function safeCell(v: string | number): string {
  const s = String(v);
  const dangerous = s.length > 0 && "=+-@\t\r".includes(s[0]);
  const guarded = dangerous ? `'${s}` : s;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]): void {
  const csv = [header.map(safeCell).join(","), ...rows.map((r) => r.map(safeCell).join(","))].join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
