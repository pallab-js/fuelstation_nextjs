"use client";

import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  /** value used for sorting; omit to disable sorting for this column */
  sortValue?: (row: T) => string | number;
  align?: "left" | "right" | "center";
  className?: string;
  width?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  dense,
  className,
  empty = "No records",
  initialSort,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  dense?: boolean;
  className?: string;
  empty?: string;
  initialSort?: { key: string; dir: "asc" | "desc" };
}) {
  const [sort, setSort] = useState(initialSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, sort, columns]);

  const toggle = (key: string) => {
    setSort((s) =>
      s?.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-hairline px-6 py-10 text-center text-[14px] text-muted">
        {empty}
      </div>
    );
  }

  return (
    <div className={cn("w-full overflow-x-auto scrollbar-slim", className)}>
      <table className="w-full border-collapse whitespace-nowrap text-[15px]">
        <thead>
          <tr className="border-b border-hairline">
            {columns.map((c) => {
              const sortable = Boolean(c.sortValue);
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  style={{ width: c.width }}
                  className={cn(
                    "mono-label bg-white py-3 pr-4 font-normal text-muted select-none",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                    c.align !== "right" && "text-left",
                    c.className,
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-1 uppercase transition-colors hover:text-ink",
                        active && "text-primary",
                      )}
                      aria-label={`Sort by ${typeof c.header === "string" ? c.header : c.key}`}
                    >
                      {c.header}
                      <span aria-hidden className="text-[10px]">
                        {active ? (sort!.dir === "asc" ? "↑" : "↓") : "↕"}
                      </span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-card-border transition-colors duration-100 hover:bg-pale-green/50"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "py-3 pr-4 align-middle text-ink",
                    dense && "py-2",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                    c.className,
                  )}
                >
                  {c.render ? c.render(row) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
