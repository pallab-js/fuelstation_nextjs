import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "ok" | "short" | "over" | "warning" | "critical" | "info" | "dark";

const TONES: Record<Tone, string> = {
  neutral: "border-hairline bg-white text-body-muted",
  ok: "border-deep-green/30 bg-pale-green text-deep-green",
  short: "border-error/30 bg-[#fdf0f0] text-error",
  over: "border-action-blue/30 bg-pale-blue text-action-blue",
  warning: "border-coral-soft bg-[#fff4f0] text-[#c14a2a]",
  critical: "border-error bg-error text-white",
  info: "border-action-blue/30 bg-pale-blue text-action-blue",
  dark: "border-primary bg-primary text-on-primary",
};

export function Chip({
  tone = "neutral",
  className,
  children,
  ...props
}: { tone?: Tone; children: ReactNode } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill border px-2.5 py-0.5 text-micro font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
