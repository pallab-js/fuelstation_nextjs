"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BootstrapProvider, useBootstrap } from "@/lib/hooks/use-bootstrap";
import { SESSION_TTL_MS, useSession } from "@/lib/session/session-store";
import { ToastViewport, toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/* ------------------------------ splash gate ------------------------------ */

function Gate({ children }: { children: ReactNode }) {
  const { phase, pct, label, error, retry } = useBootstrap();

  if (phase === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-soft-stone px-6 text-center">
        <p className="display-tight text-card text-primary">Storage unavailable</p>
        <p className="max-w-md text-[15px] text-body-muted">
          FuelOps needs IndexedDB to store data locally. Private/incognito browsing or
          blocked site data can prevent access.
        </p>
        {error && <p className="mono-label max-w-md break-all text-muted">{error}</p>}
        <Button onClick={retry}>Try again</Button>
      </div>
    );
  }

  if (phase !== "ready") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-6">
        <div className="text-center">
          <p className="display-tight text-[44px] text-primary">FuelOps</p>
          <p className="mono-label mt-2 text-muted">Multi-outlet fuel retail console</p>
        </div>
        <div className="h-1 w-64 overflow-hidden rounded-full bg-soft-stone">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${Math.max(4, pct)}%` }}
          />
        </div>
        <p className="w-64 text-center text-[14px] text-body-muted" aria-live="polite">
          {label}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

/* ------------------------------ auth guard ------------------------------- */

function AuthGuard({ children }: { children: ReactNode }) {
  const { hydrated, profileId, lastActiveTs, touch, signOut } = useSession();
  const rawPath = usePathname();
  const pathname = rawPath !== "/" ? rawPath.replace(/\/+$/, "") : "/";
  const router = useRouter();

  // routing counts as user activity; also backfills lastActiveTs for
  // sessions persisted before the idle timeout existed
  useEffect(() => {
    if (!hydrated || !profileId) return;
    if (lastActiveTs == null) touch();
    else if (Date.now() - lastActiveTs >= SESSION_TTL_MS) signOut();
    else touch();
  }, [hydrated, profileId, pathname, lastActiveTs, touch, signOut]);

  useEffect(() => {
    if (!hydrated) return;
    if (!profileId && pathname !== "/login") router.replace("/login");
    if (profileId && pathname === "/login") router.replace("/dashboard");
  }, [hydrated, profileId, pathname, router]);

  // L4: idle timeout — input activity marks the session, inactivity expires it
  useEffect(() => {
    if (!hydrated || !profileId) return;
    const mark = () => touch();
    window.addEventListener("pointerdown", mark, { passive: true });
    window.addEventListener("keydown", mark);
    const check = window.setInterval(() => {
      const ts = useSession.getState().lastActiveTs;
      if (ts != null && Date.now() - ts >= SESSION_TTL_MS) useSession.getState().signOut();
    }, 30_000);
    return () => {
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", mark);
      window.clearInterval(check);
    };
  }, [hydrated, profileId, touch]);

  if (!hydrated || (!profileId && pathname !== "/login")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <span className="mono-label text-muted">FuelOps</span>
      </div>
    );
  }
  return <>{children}</>;
}

/* --------------------------- service worker ------------------------------ */

function useServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker
        .register(`${BASE_PATH}/sw.js`)
        .then(() => {
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            toast.info("App updated", "Reload to get the latest version.");
          });
        })
        .catch(() => {
          /* offline shell unavailable — app still works from cache/IndexedDB */
        });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
}

/* ------------------------------ providers -------------------------------- */

export function AppProviders({ children }: { children: ReactNode }) {
  useServiceWorker();
  return (
    <BootstrapProvider>
      <Gate>
        <AuthGuard>
          {children}
          <ToastViewport />
        </AuthGuard>
      </Gate>
    </BootstrapProvider>
  );
}
