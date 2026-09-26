"use client";

import { useMemo, useRef, useState } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/cn";
import { useLive } from "@/lib/hooks/use-live";
import { db } from "@/lib/db/dexie";
import { verifyPin } from "@/lib/db/pin";
import { useSession } from "@/lib/session/session-store";
import { toast } from "@/components/ui/toast";

export default function LoginPage() {
  const allStaff = useLive(() => db.staff.toArray(), [], []);
  const signIn = useSession((s) => s.signIn);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const failedRef = useRef(0);

  const list = useMemo(() => allStaff.filter((s) => s.active), [allStaff]);
  const selected = useMemo(() => list.find((s) => s.id === selectedId), [list, selectedId]);

  async function submit(candidate: string) {
    if (!selected) return;
    setBusy(true);
    try {
      // progressive delay after repeated failures (cap 15 s)
      const failed = failedRef.current;
      const delay = failed >= 3 ? Math.min(15_000, 1000 * 2 ** (failed - 2)) : 0;
      if (delay > 0) {
        toast.error("Too many attempts", `Wait ${Math.ceil(delay / 1000)}s before trying again.`);
        await new Promise((r) => setTimeout(r, delay));
      }
      const ok = await verifyPin(candidate, selected.pinSalt, selected.pinHash);
      if (!ok) {
        failedRef.current = failed + 1;
        toast.error("Wrong PIN", "Try the demo PIN shown below.");
        setPin("");
        return;
      }
      failedRef.current = 0;
      signIn({
        id: selected.id,
        name: selected.name,
        role: selected.role,
        stationId: selected.stationId,
      });
    } finally {
      setBusy(false);
    }
  }

  function press(digit: string) {
    if (pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) void submit(next);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-soft-stone px-4 py-10">
      <div className="text-center">
        <h1 className="display-tight text-[52px] text-primary">FuelOps</h1>
        <p className="mono-label mt-1 text-muted">Multi-outlet fuel retail console</p>
      </div>

      {!selected ? (
        <div className="w-full max-w-md rounded-lg border border-card-border bg-white p-6 sm:p-8">
          <h2 className="text-feature text-primary">Who&apos;s on duty?</h2>
          <p className="mt-1 text-[14px] text-body-muted">
            Pick a profile — PIN gates entry, not security (demo).
          </p>
          <div className="mt-5 grid gap-2">
            {list.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  failedRef.current = 0;
                  setPin("");
                  setSelectedId(s.id);
                  setPin("");
                }}
                className="flex cursor-pointer items-center gap-3 rounded-sm border border-hairline px-4 py-3 text-left transition-colors hover:border-primary hover:bg-pale-green/40"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-primary text-micro text-on-primary">
                  {s.name
                    .split(" ")
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <span className="flex-1">
                  <span className="block text-[15px] text-ink">{s.name}</span>
                  <span className="mono-label text-muted">
                    {s.role}
                    {s.stationId ? " · station-scoped" : " · network"}
                  </span>
                </span>
              </button>
            ))}
            {list.length === 0 && (
              <p className="py-6 text-center text-[14px] text-muted">Loading profiles…</p>
            )}
          </div>
        </div>
      ) : (
        <div className="w-full max-w-sm rounded-lg border border-card-border bg-white p-6 sm:p-8">
          <div className="text-center">
            <p className="text-[18px] text-primary">{selected.name}</p>
            <p className="mono-label text-muted">{selected.role}</p>
          </div>

          <div className="mt-6 flex justify-center gap-3" aria-label="PIN entry">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn(
                  "size-3 rounded-full border border-hairline",
                  i < pin.length ? "bg-primary" : "bg-white",
                )}
              />
            ))}
          </div>
          <p className="sr-only" aria-live="polite">
            {pin.length} of 4 digits entered
          </p>

          <div className="mt-6 grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => press(d)}
                disabled={busy}
                className="cursor-pointer rounded-sm border border-hairline py-3 text-[18px] text-ink transition-colors hover:border-primary hover:bg-soft-stone disabled:opacity-40"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPin("")}
              className="cursor-pointer rounded-sm border border-transparent py-3 text-[13px] text-muted hover:text-ink"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => press("0")}
              disabled={busy}
              className="cursor-pointer rounded-sm border border-hairline py-3 text-[18px] text-ink transition-colors hover:border-primary hover:bg-soft-stone disabled:opacity-40"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => setPin((p) => p.slice(0, -1))}
              aria-label="Delete digit"
              className="flex cursor-pointer items-center justify-center rounded-sm border border-transparent py-3 text-muted hover:text-ink"
            >
              <Delete size={18} aria-hidden />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              failedRef.current = 0;
              setSelectedId(null);
              setPin("");
            }}
            className="mt-5 w-full cursor-pointer text-center text-[14px] text-action-blue underline underline-offset-4"
          >
            Choose a different profile
          </button>
        </div>
      )}

      <p className="mono-label text-muted">Demo PIN for every profile · 1234</p>
    </div>
  );
}
