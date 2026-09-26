"use client";

import { cn } from "@/lib/cn";

export function Tabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-6 border-b border-hairline", className)} role="tablist">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(t.value)}
            className={cn(
              "relative cursor-pointer pb-3 text-[15px] transition-colors",
              active ? "text-primary" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
            {typeof t.count === "number" && (
              <span className="ml-1.5 text-micro text-muted">{t.count}</span>
            )}
            {active && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-hairline px-6 py-14 text-center">
      <div className="mb-4 text-muted" aria-hidden>
        {icon ?? (
          <svg width="56" height="40" viewBox="0 0 56 40" fill="none" stroke="currentColor" strokeWidth="1.25">
            <rect x="1" y="1" width="54" height="38" rx="4" />
            <path d="M1 28h54M14 28V14M27 28v-8M40 28V18" />
          </svg>
        )}
      </div>
      <h3 className="text-[18px] text-primary">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-[14px] text-body-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-sm bg-soft-stone", className)} />;
}

export function ProgressBar({
  pct,
  tone = "ok",
  className,
  label,
}: {
  pct: number;
  tone?: "ok" | "warning" | "critical";
  className?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const fill =
    tone === "critical" ? "bg-error" : tone === "warning" ? "bg-coral" : "bg-deep-green";
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-soft-stone", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", fill)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-hairline border-t-primary",
        className,
      )}
    />
  );
}
