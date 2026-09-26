"use client";

import { create } from "zustand";
import { cn } from "@/lib/cn";

export type ToastTone = "default" | "success" | "warning" | "error";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

const TONE_CLASS: Record<ToastTone, string> = {
  default: "border-border-light bg-white text-ink",
  success: "border-deep-green/30 bg-pale-green text-deep-green",
  warning: "border-coral-soft bg-[#fff4f0] text-primary",
  error: "border-error/30 bg-[#fdf0f0] text-error",
};

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    }, 4200);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  success: (title: string, description?: string) =>
    useToasts.getState().push({ title, description, tone: "success" }),
  error: (title: string, description?: string) =>
    useToasts.getState().push({ title, description, tone: "error" }),
  warning: (title: string, description?: string) =>
    useToasts.getState().push({ title, description, tone: "warning" }),
  info: (title: string, description?: string) =>
    useToasts.getState().push({ title, description, tone: "default" }),
};

export function ToastViewport() {
  const { toasts, dismiss } = useToasts();
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="no-print pointer-events-none fixed right-4 bottom-4 z-100 flex w-[min(92vw,380px)] flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "pointer-events-auto rounded-sm border px-4 py-3 shadow-none",
            TONE_CLASS[t.tone],
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[15px] leading-snug">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-micro text-body-muted">{t.description}</p>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
              className="text-micro text-muted transition-colors hover:text-ink"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
