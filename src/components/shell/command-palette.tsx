"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { navForRole } from "./nav-items";
import { useSession } from "@/lib/session/session-store";

interface PaletteItem {
  id: string;
  group: string;
  label: string;
  href: string;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const role = useSession((s) => s.role);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo<PaletteItem[]>(() => {
    const nav = navForRole(role).map((n) => ({
      id: `nav:${n.href}`,
      group: "Navigate",
      label: n.label,
      href: n.href,
    }));
    const actions: PaletteItem[] = [
      { id: "act:pos", group: "Quick action", label: "Record a fuel sale", href: "/pos" },
      { id: "act:dip", group: "Quick action", label: "Record a dip reading", href: "/inventory?tab=tanks" },
      { id: "act:close", group: "Quick action", label: "Close a shift", href: "/shifts" },
      { id: "act:reports", group: "Quick action", label: "Daily closing report", href: "/reports?report=closing" },
    ].filter((a) => navForRole(role).some((n) => a.href.startsWith(n.href)));
    return [...nav, ...actions];
  }, [role]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (i) => i.label.toLowerCase().includes(needle) || i.href.includes(needle),
    );
  }, [items, q]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [open]);

  const close = () => {
    setQ("");
    setIdx(0);
    onClose();
  };

  if (!open) return null;

  const go = (item: PaletteItem | undefined) => {
    if (!item) return;
    close();
    router.push(item.href);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-start justify-center bg-primary/40 px-4 pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg overflow-hidden rounded-lg border border-card-border bg-white"
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIdx((i) => Math.min(i + 1, filtered.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setIdx((i) => Math.max(i - 1, 0));
          }
          if (e.key === "Enter") go(filtered[idx]);
        }}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
          }}
          placeholder="Search pages and actions…"
          aria-label="Search pages and actions"
          className="w-full border-b border-hairline px-5 py-4 text-[16px] text-ink placeholder:text-muted focus:outline-none"
        />
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 && (
            <p className="px-5 py-6 text-center text-[14px] text-muted">No matches</p>
          )}
          {filtered.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onMouseEnter={() => setIdx(i)}
              onClick={() => go(item)}
              className={cn(
                "flex w-full cursor-pointer items-center justify-between px-5 py-2.5 text-left text-[15px]",
                i === idx ? "bg-pale-green text-ink" : "text-body-muted",
              )}
            >
              <span>
                <span className="mono-label mr-3 text-muted">{item.group}</span>
                {item.label}
              </span>
              {i === idx && <CornerDownLeft size={14} aria-hidden className="text-muted" />}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
