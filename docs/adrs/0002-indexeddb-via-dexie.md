# ADR 0002: IndexedDB via Dexie for user state

**Status:** Accepted
**Date:** 2026-05-23

## Context

Per [ADR 0001](0001-client-only-architecture.md), all user state lives in the browser. The data model is genuinely relational:

- `inventory` — materials currently held (per item id)
- `queue` — ordered build entries, each with per-entry progress checkmarks and an optional project reference
- `projects` — named groupings the user creates
- `allocations` — per-project per-item claims (composite-keyed)

We need indexed lookups (e.g., "all queue rows for project X", "all allocations for item Y"), versioned schema migrations, and the ability to grow beyond `localStorage`'s ~5 MB limit.

## Decision

Use **IndexedDB** as the persistence layer, wrapped by **Dexie** for ergonomics. Schema lives in `apps/web/src/db/schema.ts`. Version every change additively — never edit a `this.version(N).stores(...)` block once published.

## Alternatives considered

- **`localStorage`** — string-only, ~5 MB cap, synchronous (blocks rendering on large reads), no indexes. Fine for a single-key filter ([ADR 0001](0001-client-only-architecture.md)-style preferences), inadequate for the relational shape.
- **Raw IndexedDB API** — verbose request/transaction callbacks, painful version-upgrade ergonomics, no out-of-the-box reactivity. Dexie wraps all of this with ~20 KB bundle cost.
- **WebSQL / SQLite-in-WASM** — interesting (real SQL!), but WebSQL is deprecated and a WASM SQLite adds ~1 MB to the bundle for marginal value here.
- **OPFS** — better for opaque binary blobs; doesn't help with a relational document model.

## Consequences

**Positive**

- Indexed queries (`db.queue.where('projectId').equals(id)`) instead of full scans.
- `dexie-react-hooks` (`useLiveQuery`) gives reactive subscriptions — UI auto-refreshes when DB writes happen, even from other tabs.
- Atomic transactions across multiple tables (used in `markGathered`, `setAllocationExact`, `deleteProject` cascade).
- Schema-versioning machinery handles migrations as users upgrade.

**Negative**

- **Schema migrations are irreversible in user browsers.** A bad v(N) ships and lives on every user's device. Mitigation: every change adds a new version; old versions stay untouched. Test migrations against representative seed data before merging.
- **`useLiveQuery` returns `undefined` on first render**, which fights `react-hooks/exhaustive-deps`. Addressed by `useLiveArray` wrapper in `apps/web/src/lib/useLiveArray.ts`.
- **No cross-browser sync** (intentional, per ADR 0001). Each browser holds its own DB.
- **Read-modify-write races** between rapid React event handlers and another tab. Mitigated by always wrapping mutations in `db.transaction('rw', ...)` or `.modify(row => ...)`.

## Conventions enforced in CLAUDE.md

- Never edit existing `this.version(N).stores(...)` blocks; add a new version with `.upgrade()` if a backfill is needed.
- Mutating helpers (`markGathered`, allocation edits, `toggleProgress`) read inside the transaction; do not pass stale React state into `db.X.put(...)`.
