# ADR 0007: Allocations as claims, not transfers

**Status:** Accepted
**Date:** 2026-05-23

## Context

Users build multiple projects (e.g., "Cyclops Build" and "Base Expansion") in parallel. They want two related but distinct views of their material situation:

- **Global inventory** — "How much Titanium do I physically have?"
- **Per-project earmarks** — "How much of that Titanium have I set aside for the Cyclops?"

The data model needs to support both without making one expensive to compute or surprising to edit.

## Decision

- **Global inventory is the source of truth.** One `count` per item id, stored in the `inventory` table.
- **Allocations are claims against that global pool.** One row per `(projectId, itemId)` in the `allocations` table.
- **The sum of allocations across projects can exceed the global count.** This is the "over-allocated" state, surfaced with a soft `⚠ over` warning per row, not blocked.
- **Mutation paths that grow allocations auto-bump global stock up to maintain the invariant**, but never decrease it. Specifically:
  - `setAllocationExact` in Inventory.tsx
  - `markGathered` in Gathering.tsx (project mode)
- **The Inventory tab's All-Projects view lets the user decrease global below allocations.** This is the intentional escape hatch — gives the soft warning teeth without blocking.

## Alternatives considered

- **Per-project isolated stock pools** — each project has its own inventory; you decide where gathered material lands when you pick it up. Conceptually clean but makes "how much do I have total?" expensive to compute and creates friction when a queued item moves between projects.
- **Strict clamping** — disallow allocations exceeding stock. Surprising UX when you plan ahead before gathering, or when stock drops (e.g., a typo in the inventory editor would silently delete project claims).
- **Auto-rebalance** — when global drops, proportionally reduce all project allocations to fit. Hides what just happened from the user; subtle data loss.

## Consequences

**Positive**

- Both questions ("total?" and "earmarked?") are answered with a single map lookup.
- Speculative planning works: a user can allocate 500 Titanium to a future Cyclops project before gathering any of it. The `⚠ over` warning communicates state without blocking.
- Mark-gathered on Gathering does the intuitive thing — when you check off a material, both your project allocation and your global inventory go up together.
- Project deletion drops that project's allocations cleanly, releasing the implicit reservation without touching global stock.

**Negative**

- **The invariant `global ≥ sum(allocations)` is enforced by mutation paths, not the schema.** Direct DB edits or a forgotten transaction path can break it. Mitigated by the soft warning and by routing all mutations through the typed helpers.
- **Users must understand the difference between "stock" and "allocated."** Documented in the project-mode banner on Inventory; the row labels (`alloc`, `stock`) explicitly disambiguate.
- **Two writes per Gathering check** (allocation + global) instead of one — negligible cost.

## Conventions enforced

- All allocation writes happen inside `db.transaction('rw', db.inventory, db.allocations, ...)` so the auto-bump and the allocation write commit together.
- The `setAllocationExact`/`bumpAllocation`/`markGathered` helpers are the only sanctioned mutation paths. New features that touch allocations must use them or replicate the invariant in their own transaction.
