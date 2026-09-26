"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { navForRole } from "./nav-items";
import { useSession } from "@/lib/session/session-store";
import { useLive } from "@/lib/hooks/use-live";
import { db } from "@/lib/db/dexie";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const role = useSession((s) => s.role);
  const items = navForRole(role);
  const unacked = useLive(() => db.alerts.toArray(), [], []).filter((a) => !a.acked).length;

  return (
    <nav
      aria-label="Primary"
      className="flex w-full flex-col gap-1 p-3 lg:w-56 lg:shrink-0 lg:border-r lg:border-hairline lg:bg-canvas"
    >
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-pill px-4 py-2.5 text-[15px] transition-colors duration-150",
              active
                ? "bg-primary text-on-primary"
                : "text-body-muted hover:bg-soft-stone hover:text-ink",
            )}
          >
            <Icon size={18} strokeWidth={1.5} aria-hidden />
            <span className="flex-1">{item.label}</span>
            {item.href === "/alerts" && unacked > 0 && (
              <span
                className={cn(
                  "flex min-w-5 items-center justify-center rounded-full px-1 text-micro",
                  active ? "bg-coral text-primary" : "bg-coral text-primary",
                )}
              >
                {unacked}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
