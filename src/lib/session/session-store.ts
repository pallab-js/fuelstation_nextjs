"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Role = "owner" | "manager" | "attendant";
export type Scope = "all" | string;

/** Idle time after which the session force-signs-out (L4). */
export const SESSION_TTL_MS = 30 * 60_000;
/** Minimum gap between activity marks — avoids a store write per keystroke. */
const TOUCH_THROTTLE_MS = 30_000;

interface SessionState {
  profileId: string | null;
  profileName: string | null;
  role: Role | null;
  homeStationId: string | null;
  scope: Scope;
  /** epoch ms of last user activity — persisted for the idle timeout (L4) */
  lastActiveTs: number | null;
  /** true once persisted state has been read from localStorage */
  hydrated: boolean;
  signIn: (p: { id: string; name: string; role: Role; stationId: string | null }) => void;
  signOut: () => void;
  setScope: (scope: Scope) => void;
  /** record user activity (throttled) for the idle timeout */
  touch: () => void;
  setHydrated: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      profileId: null,
      profileName: null,
      role: null,
      homeStationId: null,
      scope: "all",
      lastActiveTs: null,
      hydrated: false,
      signIn: (p) =>
        set({
          profileId: p.id,
          profileName: p.name,
          role: p.role,
          homeStationId: p.stationId,
          scope: p.stationId ?? "all",
          lastActiveTs: Date.now(),
        }),
      signOut: () =>
        set({
          profileId: null,
          profileName: null,
          role: null,
          homeStationId: null,
          scope: "all",
          lastActiveTs: null,
        }),
      setScope: (scope) =>
        set((s) => {
          // attendants are pinned to their own station (M3)
          if (s.role === "attendant" && s.homeStationId && scope !== s.homeStationId) return {};
          return { scope };
        }),
      touch: () => {
        const cur = get().lastActiveTs;
        const now = Date.now();
        if (cur !== null && now - cur < TOUCH_THROTTLE_MS) return;
        set({ lastActiveTs: now });
      },
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "fuelops.session",
      partialize: (s) => ({
        profileId: s.profileId,
        profileName: s.profileName,
        role: s.role,
        homeStationId: s.homeStationId,
        scope: s.scope,
        lastActiveTs: s.lastActiveTs,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);

/** Resolve the station ids visible to the current session scope. */
export function scopeMatches(stationId: string, scope: Scope): boolean {
  return scope === "all" || scope === stationId;
}

export function canWriteStationData(role: Role | null): boolean {
  return role === "owner" || role === "manager" || role === "attendant";
}

export function canManageExpenses(role: Role | null): boolean {
  return role === "owner" || role === "manager";
}

export function canManageSettings(role: Role | null): boolean {
  return role === "owner";
}
