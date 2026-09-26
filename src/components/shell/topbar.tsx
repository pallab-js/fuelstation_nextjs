"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, ChevronDown, LogOut, Search, WifiOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session/session-store";
import { useLive } from "@/lib/hooks/use-live";
import { db } from "@/lib/db/dexie";

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return online;
}

function ScopeSwitcher() {
  const { scope, setScope, role, homeStationId } = useSession();
  const stations = useLive(() => db.stations.toArray(), [], []);
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));

  if (role === "attendant" || homeStationId) {
    const s = stations.find((x) => x.id === (homeStationId ?? scope));
    return (
      <span className="hidden text-[13px] text-body-muted sm:block">
        {s ? `${s.code} · ${s.name}` : "—"}
      </span>
    );
  }

  const current = scope === "all" ? null : stations.find((s) => s.id === scope);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex cursor-pointer items-center gap-2 rounded-pill border border-hairline bg-white px-3.5 py-1.5 text-[13px] text-ink transition-colors hover:border-primary"
      >
        <span className="mono-label text-muted">Scope</span>
        <span>{current ? `${current.code} — ${current.name}` : "All stations"}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 z-50 mt-2 w-72 rounded-sm border border-hairline bg-white py-1"
        >
          <button
            type="button"
            role="option"
            aria-selected={scope === "all"}
            onClick={() => {
              setScope("all");
              setOpen(false);
            }}
            className={cn(
              "w-full cursor-pointer px-4 py-2.5 text-left text-[14px] hover:bg-soft-stone",
              scope === "all" && "bg-pale-green",
            )}
          >
            All stations (network)
          </button>
          {stations.map((s) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={scope === s.id}
              onClick={() => {
                setScope(s.id);
                setOpen(false);
              }}
              className={cn(
                "w-full cursor-pointer px-4 py-2.5 text-left text-[14px] hover:bg-soft-stone",
                scope === s.id && "bg-pale-green",
              )}
            >
              <span className="mono-label mr-2 text-muted">{s.code}</span>
              {s.name}
              <span className="block text-micro text-muted">{s.city}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const { profileName, role, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const initials = (profileName ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex cursor-pointer items-center gap-2 rounded-pill border border-transparent py-1 pr-2 pl-1 transition-colors hover:border-hairline"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-micro text-on-primary">
          {initials}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[13px] text-ink">{profileName}</span>
          <span className="mono-label block text-muted">{role}</span>
        </span>
        <ChevronDown size={14} aria-hidden className="text-muted" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 rounded-sm border border-hairline bg-white py-1"
        >
          <div className="border-b border-card-border px-4 py-3">
            <p className="text-[15px] text-ink">{profileName}</p>
            <p className="mono-label text-muted">{role} · PIN active</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
            className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left text-[14px] text-ink hover:bg-soft-stone"
          >
            <LogOut size={15} aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Topbar({
  onOpenMenu,
  onOpenPalette,
}: {
  onOpenMenu: () => void;
  onOpenPalette: () => void;
}) {
  const online = useOnline();
  const alerts = useLive(() => db.alerts.toArray(), [], []);
  const unacked = alerts.filter((a) => !a.acked).length;

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-white/95 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation"
          className="flex size-9 cursor-pointer items-center justify-center rounded-pill border border-hairline lg:hidden"
        >
          ☰
        </button>

        <Link href="/dashboard" className="display-tight text-[22px] text-primary">
          FuelOps
        </Link>

        <div className="ml-2 hidden flex-1 items-center gap-3 md:flex">
          <ScopeSwitcher />
        </div>

        {!online && (
          <span className="ml-auto flex items-center gap-1.5 rounded-pill border border-coral-soft bg-[#fff4f0] px-3 py-1 text-micro text-[#c14a2a]">
            <WifiOff size={12} aria-hidden /> Offline · saved locally
          </span>
        )}

        <div className={cn("ml-auto flex items-center gap-2", online && "md:ml-0")}>
          <button
            type="button"
            onClick={onOpenPalette}
            className="hidden cursor-pointer items-center gap-2 rounded-pill border border-hairline px-3 py-1.5 text-[13px] text-muted transition-colors hover:border-primary hover:text-ink sm:flex"
            aria-label="Open command palette"
          >
            <Search size={14} aria-hidden /> Search
            <kbd className="mono-label rounded border border-hairline px-1 text-muted">⌘K</kbd>
          </button>

          <Link
            href="/alerts"
            aria-label={`Alerts${unacked ? `, ${unacked} unread` : ""}`}
            className="relative flex size-9 cursor-pointer items-center justify-center rounded-pill border border-hairline text-ink transition-colors hover:border-primary"
          >
            <Bell size={16} strokeWidth={1.5} aria-hidden />
            {unacked > 0 && (
              <span className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-coral px-1 text-micro text-primary">
                {unacked > 9 ? "9+" : unacked}
              </span>
            )}
          </Link>

          <ProfileMenu />
        </div>
      </div>
      <div className="flex items-center gap-3 px-4 pb-2 md:hidden">
        <ScopeSwitcher />
      </div>
    </header>
  );
}
