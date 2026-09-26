"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-primary text-on-primary border border-primary hover:bg-white hover:text-primary",
  secondary:
    "bg-transparent text-ink border border-transparent underline underline-offset-4 decoration-hairline hover:decoration-ink px-0",
  outline:
    "bg-transparent text-primary border border-primary/60 hover:border-primary hover:bg-soft-stone px-0",
  ghost: "bg-transparent text-body-muted border border-transparent hover:text-ink hover:bg-soft-stone",
  danger: "bg-error text-white border border-error hover:bg-white hover:text-error",
};

const SIZE: Record<Size, string> = {
  sm: "px-3 py-1.5 text-[13px]",
  md: "px-6 py-3 text-[14px]",
  lg: "px-7 py-3.5 text-[15px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-pill font-medium leading-[1.71] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40",
        variant !== "secondary" && "rounded-pill",
        variant === "secondary" && "rounded-none",
        VARIANT[variant],
        variant === "secondary" && "h-auto px-0 py-2 text-[16px] font-normal",
        variant === "outline" && "h-auto rounded-xl px-3 py-1.5 text-[14px]",
        variant === "ghost" && "rounded-pill",
        SIZE[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
