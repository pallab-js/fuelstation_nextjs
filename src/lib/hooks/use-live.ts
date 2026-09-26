"use client";

import { useLiveQuery } from "dexie-react-hooks";

/**
 * Thin wrapper over dexie's useLiveQuery with an explicit fallback so
 * list/record types stay predictable across renders.
 */
export function useLive<T>(querier: () => Promise<T> | T, deps: unknown[], fallback: T): T {
  return useLiveQuery(querier, deps, fallback) as T;
}
