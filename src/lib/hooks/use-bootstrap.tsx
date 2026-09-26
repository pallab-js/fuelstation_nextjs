"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ensureSeeded, type SeedProgress } from "@/lib/db/seed-runner";

type Phase = "starting" | SeedProgress["phase"] | "ready" | "error";

interface BootstrapState {
  phase: Phase;
  pct: number;
  label: string;
  error?: string;
  retry: () => void;
}

const BootstrapContext = createContext<BootstrapState>({
  phase: "starting",
  pct: 0,
  label: "Starting…",
  retry: () => {},
});

let inflight: Promise<void> | null = null;

function startSeed(onProgress: (p: SeedProgress) => void): Promise<void> {
  if (inflight) return inflight;
  inflight = ensureSeeded(onProgress).catch((e: unknown) => {
    inflight = null;
    throw e;
  });
  return inflight;
}

export function BootstrapProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BootstrapState>({
    phase: "starting",
    pct: 0,
    label: "Starting local database…",
    retry: () => {},
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    startSeed((p) => {
      if (!cancelled) setState((s) => ({ ...s, phase: p.phase, pct: p.pct, label: p.label }));
    })
      .then(() => {
        if (!cancelled) setState((s) => ({ ...s, phase: "ready", pct: 100, label: "Ready" }));
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState((s) => ({
            ...s,
            phase: "error",
            pct: 0,
            label: "Storage unavailable",
            error: e instanceof Error ? e.message : String(e),
          }));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const value: BootstrapState = {
    ...state,
    retry: () => {
      setState((s) => ({ ...s, phase: "starting", pct: 0, label: "Retrying…", error: undefined }));
      setAttempt((a) => a + 1);
    },
  };

  return <BootstrapContext.Provider value={value}>{children}</BootstrapContext.Provider>;
}

export function useBootstrap(): BootstrapState {
  return useContext(BootstrapContext);
}
