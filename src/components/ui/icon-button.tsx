"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "outline" | "ghost";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required accessible name — icon-only buttons have no text content. */
  "aria-label": string;
  variant?: Variant;
}

const VARIANT: Record<Variant, string> = {
  outline: "border border-hairline text-ink hover:border-primary",
  ghost: "border border-transparent text-muted hover:text-ink hover:bg-soft-stone",
};

/**
 * Icon-only button with a guaranteed ≥44×44px tap target (WCAG 2.5.5 / 2.5.8).
 * The visual icon can be smaller; the hit area is the `size-11` box. Centralises
 * the sizing that was previously ad-hoc (`size-8` / `size-9`) across the app and
 * replaces raw `☰` / `✕` glyphs with consistent lucide icons at call sites.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = "outline", children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        "inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-pill transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40",
        VARIANT[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
IconButton.displayName = "IconButton";
