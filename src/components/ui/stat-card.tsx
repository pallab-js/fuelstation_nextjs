import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function StatCard({
  label,
  value,
  sub,
  tone = "default",
  className,
  children,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "positive" | "negative" | "neutral";
  className?: string;
  children?: ReactNode;
}) {
  const toneClass =
    tone === "positive"
      ? "text-deep-green"
      : tone === "negative"
        ? "text-error"
        : "text-primary";
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-md border border-card-border bg-white p-5",
        className,
      )}
    >
      <span className="mono-label text-muted">{label}</span>
      <span className={cn("display-tight text-[34px] leading-none tabular-nums", toneClass)}>
        {value}
      </span>
      {sub && <span className="text-[13px] text-body-muted">{sub}</span>}
      {children}
    </div>
  );
}
