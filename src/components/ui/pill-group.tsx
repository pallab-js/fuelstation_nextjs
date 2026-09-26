"use client";

import { cn } from "@/lib/cn";

export interface PillOption<T extends string> {
  value: T;
  label: string;
}

export function PillGroup<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: readonly PillOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex flex-wrap items-center gap-1 rounded-xl border border-hairline bg-white p-1",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "cursor-pointer rounded-pill px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150",
              active
                ? "bg-primary text-on-primary"
                : "text-body-muted hover:bg-soft-stone hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
