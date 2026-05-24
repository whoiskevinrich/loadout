# ADR 0008: Fractional positions for queue ordering

**Status:** Accepted
**Date:** 2026-05-23

## Context

Queue entries support drag-and-drop reorder, both within a project group and across project groups. Each entry has a `position: number` field; the visible queue is sorted by `position` ascending. The DnD implementation needs to assign a new position when an entry is dropped between two existing rows, without forcing a write to every other row in the queue.

## Decision

Use **Float64 fractional positions**. When an entry is dropped between rows A (`position: 3`) and B (`position: 4`), the new position is `(3 + 4) / 2 = 3.5`. For drops into an empty group, use `maxPos + 1` across the entire queue. No renumbering pass runs on each drop.

## Alternatives considered

- **Integer renumbering on every drop** — recompute every row's position to `0..N` after each reorder. Simple, but writes O(N) rows per drop. With `useLiveQuery` re-rendering on every write, this can cause UI thrashing for large queues.
- **LexoRank-style lexicographic strings** — Atlassian's approach: assign string keys like `"0|hzzzzz"` that can always be inserted between with a longer string. Robust to indefinite subdivision. More code, would need a small library or a careful hand-roll. Saved for when we actually need it.
- **Linked-list pointers** (`prevId`/`nextId`) — O(1) inserts but expensive ordered traversal (recursive walk on every render) and tricky to maintain through cross-group moves.

## Consequences

**Positive**

- **O(1) writes per drop.** Reordering writes exactly one row.
- **Trivial to implement** — the midpoint math is one line.
- **Cross-group moves work transparently** — `position` is global; the visible group's order is whatever rows in that group sort to under their existing positions.

**Negative**

- **Float64 precision exhausts after ~52 same-slot drops.** Each midpoint halves the gap; after enough halvings, `(a + b) / 2 === a` due to IEEE-754. Two rows collapse to the same position; `orderBy('position')` returns them in arbitrary order; the up/down swap operation becomes a no-op (writes the same value to both).
- **No self-healing.** Once positions collide, no path in the current UI fixes them — requires a manual DB edit (or, eventually, the LexoRank migration noted below).
- **An empty-group drop's `maxPos + 1` can grow unbounded** if a user fills and empties a group repeatedly. Each cycle bumps the high-water mark. Not a problem until extreme use.

The midpoint code in `apps/web/src/routes/Queue.tsx` (`commitDrop`) carries an explanatory comment for future readers.

## Migration path

When precision degradation becomes a real user complaint (or before, if we sense it coming), replace the `number` position with a `string` LexoRank, write a Dexie v(N+1) upgrade that converts existing rows by their current sort order, and update the midpoint math. Tracked in `TODO.md`.
