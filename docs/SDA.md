# SDA — Software Design & Architecture

## 1. Architecture style

**Local-first, client-only SPA** rendered by Next.js (App Router, static export) with
**IndexedDB (Dexie)** as the system of record and a **service worker** for offline
capability. No application server: the deployed artifact is pure static files.

```
┌─────────────────────────────────────────────────────────────┐
│ Browser tab (static Next.js shell)                          │
│                                                             │
│  Routes (app/*)  ── server-rendered shell at build time     │
│       │  'use client' pages/features                        │
│       ▼                                                     │
│  Feature components (forms, tables, charts)                 │
│       │  useLiveQuery / useMemo selectors                   │
│       ▼                                                     │
│  Repository layer  (lib/repo/*)  ← single I/O seam          │
│       │  typed domain functions, zod-validated input         │
│       ▼                                                     │
│  Dexie 4 (IndexedDB)  ── stations, sales, shifts, tanks …   │
│                                                             │
│  Session store (zustand + localStorage)                     │
│  Service worker (public-generated sw.js)                    │
│     • precache app shell + hashed chunks                    │
│     • navigation fallback → /offline                        │
└─────────────────────────────────────────────────────────────┘
```

**Why client-only:** the requirement is local-first + offline + GitHub distribution.
A static export runs on any static host (GitHub Pages), needs no secrets, and every
read/write is instant (no network round trip). The repository layer is the deliberate
seam where a future sync/HTTP backend can be inserted without touching UI code.

## 2. Layers & responsibilities

| Layer | Location | Responsibility | Rules |
|---|---|---|---|
| Routes | `src/app/**` | URL → page composition, metadata | Pages are thin; no business logic |
| Shell | `src/components/shell/**` | Nav, top bar, scope switcher, ⌘K, offline badge | Layout only, no data writes |
| Features | `src/components/*` | Forms, tables, charts, dialogs | Consume hooks/repos only |
| Hooks | `src/lib/hooks/**` | liveQuery binding, session, scope, media queries | No direct `db.` calls outside repos |
| Domain | `src/lib/domain/**` | Pure functions: variance, aging, totals, formatting | Zero I/O → unit tested |
| Repositories | `src/lib/repo/**` | All Dexie reads/writes, recompute + raise alerts | zod-validated input, audit-logged |
| Database | `src/lib/db/**` | Schema, migrations, seed generator | Deterministic seed (seeded RNG) |
| Session | `src/lib/session/**` | Profile switch, PIN, role, station scope | Persisted in localStorage |

## 3. Data flow patterns

1. **Read:** component → `useLiveQuery(repo.query…)` → Dexie re-emits on any related
   write → recompute selector → render. All views are automatically reactive.
2. **Write:** form (react-hook-form + zod) → `repo.action(input)` → transaction in
   Dexie → derived rows updated (e.g. shift totals) → alert evaluation → audit entry.
3. **Derived analytics:** pure selectors (`lib/domain/analytics.ts`) over liveQuery
   results, memoized; no stored aggregates (keeps single source of truth = transactions).
4. **Cross-cutting:** every mutation goes through `withAudit(actor, action, fn)`.

## 4. State management

- **Server/global state:** none — IndexedDB is the store; liveQuery is the subscription.
- **Session/UI state:** zustand store (`sessionStore`) — active profile, role, station
  scope, recent stations, palette open. Persisted via `localStorage` (survives reload).
- **Form state:** react-hook-form + zod resolvers.
- **URL state:** filters/date ranges kept in `?search` params (shareable, back-button
  friendly; static-export compatible).

## 5. Offline & PWA design

- `next build` (static export) → `out/` → `scripts/build-sw.mjs` scans the output and
  writes `out/sw.js` containing a **hashed precache manifest** (HTML, `_next/static`,
  icons, manifest).
- SW strategies: hashed static assets → cache-first; navigations → network-first with
  cached-shell fallback, then `/offline/`; other same-origin → stale-while-revalidate.
- IndexedDB is inherently offline; the only online-dependent bits are font/asset fetches
  (precached) → app is fully usable in airplane mode after first visit.
- UI surfaces an offline pill (navigator.onLine + SW update-available toast).

## 6. Static-export constraints (Next.js specifics)

- No dynamic `[param]` segments at runtime → detail views use `?id=` search params
  (wrapped in `<Suspense>` for `useSearchParams`).
- No Server Actions, cookies, middleware, rewrites → all mutations are client-side repo
  calls (already the design).
- `basePath` env-driven for GitHub Pages project sites.

## 7. Security & integrity (prototype scope)

- PINs stored as salted SHA-256 (WebCrypto), never plaintext; PIN is local convenience,
  explicitly **not** a security boundary (documented in README).
- zod validation at repo boundary prevents malformed records.
- All money/litres stored as **integers** (paise / millilitres) → no float drift.
- JSON backup export/import lets users keep data portable; no data leaves the device.

## 8. Error handling

- Repo actions throw typed `DomainError`s → toast + form error mapping.
- Route-level `error.tsx` + global offline page; Dexie open failure (private browsing)
  shows a blocking "storage unavailable" screen with retry.

## 9. Extensibility / future sync

The repository layer exposes `repo.x.create/update/remove` as async functions. Adding
cloud sync later = implementing a `SyncTransport` that (a) replicates a change log
(Dexie's `Table.mapToClass` + `updatedAt` fields) and (b) merges by hybrid logical
clock. The prototype records `updatedAt` on every row to keep that door open cheaply.
