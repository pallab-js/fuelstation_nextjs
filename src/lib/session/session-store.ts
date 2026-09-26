"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Role = "owner" | "manager" | "attendant";
export type Scope = "all" | string;

interface SessionState {
  profileId: string | null;
  profileName: string | null;
  role: Role | null;
  homeStationId: string | null;
  scope: Scope;
  /** true once persisted state has been read from localStorage */
  hydrated: boolean;
  signIn: (p: { id: string; name: string; role: Role; stationId: string | null }) => void;
  signOut: () => void;
  setScope: (scope: Scope) => void;
  setHydrated: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      profileId: null,
      profileName: null,
      role: null,
      homeStationId: null,
      scope: "all",
      hydrated: false,
      signIn: (p) =>
        set({
          profileId: p.id,
          profileName: p.name,
          role: p.role,
          homeStationId: p.stationId,
          scope: p.stationId ?? "all",
        }),
      signOut: () =>
        set({
          profileId: null,
          profileName: null,
          role: null,
          homeStationId: null,
          scope: "all",
        }),
      setScope: (scope) => set({ scope }),
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
