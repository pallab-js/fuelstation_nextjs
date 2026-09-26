import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-md border border-card-border bg-canvas p-6", className)}
      {...props}
    />
  );
}

export function StoneCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-sm bg-soft-stone p-8", className)} {...props} />
  );
}

export function DarkCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-sm bg-primary p-6 text-on-primary", className)}
      {...props}
    />
  );
}

export function CardTitle({
  children,
  className,
  hint,
}: {
  children: ReactNode;
  className?: string;
  hint?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h3 className={cn("text-feature text-primary", className)}>{children}</h3>
      {hint && <span className="mono-label text-muted">{hint}</span>}
    </div>
  );
}
