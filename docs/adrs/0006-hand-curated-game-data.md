# ADR 0006: Hand-curated game data in bundled JSON

**Status:** Accepted
**Date:** 2026-05-23

## Context

The app needs item and recipe data for Subnautica (and eventually other survival games). Data points per item include id, display name, category, sources, biomes, and crafting station; recipes need an output id and ordered inputs with quantities. Accuracy matters — wrong recipes silently produce wrong gathering plans.

The data is mostly static — recipes change only on major game patches. Volume is bounded (Subnautica has ~150 buildable items in vanilla).

## Decision

One JSON file per game at `apps/web/src/games/<game-id>.json`. The file is imported via the bundler (`resolveJsonModule: true`), cast to the `Game` type from `apps/web/src/games/types.ts`, and registered in `apps/web/src/games/index.ts`. The file is **hand-curated and column-aligned** for readability.

When Claude (or any contributor) adds or changes a recipe, it **must verify against the Subnautica wiki** (`https://subnautica.fandom.com/wiki/`) and flag any divergence from a user-stated recipe rather than silently choosing one.

## Alternatives considered

- **Scrape the Subnautica Fandom wiki at build or runtime** — brittle (wiki HTML changes), requires CORS proxy at runtime, attribution + ToS questions. The community wiki is the gold source but isn't an API.
- **User-editable in-app catalog** — would let users fix recipes themselves and skip the build step, but requires writing a UI for catalog editing (a non-trivial surface) and slows bootstrap for new users who'd have to enter data from scratch.
- **External API / CMS** — adds a backend dependency, contradicts [ADR 0001](0001-client-only-architecture.md).
- **Embedded SQLite database** — adds bundle weight (~1 MB for sql.js) for what is fundamentally an array of structs.

## Consequences

**Positive**

- Zero runtime fetch, zero CORS, instant startup.
- The catalog is editable with any text editor; reviewable as a normal git diff.
- A single source of truth — no risk of stale cached data.
- Recipes verified at edit time (per the workflow rule) catch errors before they ship.

**Negative**

- **Manual curation labor.** Adding a new game means entering all items + recipes by hand. Mitigated by the `/add-catalog-items` skill which structures the work.
- **No hot updates.** A wrong recipe ships and must be patched + redeployed; users running the cached PWA-style app won't pick up the fix until they refresh.
- **Bundle size grows linearly with catalog.** Subnautica's ~100 items + recipes add ~10 KB to the JS bundle; acceptable. A game with thousands of items would force a different approach.

## Conventions

- **`apps/web/src/games/<game-id>.json` is column-aligned.** Use `Edit` for surgical changes — never `Write` (it destroys alignment). Items grouped by category, recipes after items.
- IDs are kebab-case. Disambiguate when needed (e.g., `fabricator-base` for the placeable Fabricator vs. the conceptual station "Fabricator" used in `craftedAt`).
- Categories are restricted to the `ItemCategory` union in `apps/web/src/games/types.ts`. Adding a category requires updating the type AND the `FILTERS` list in `apps/web/src/routes/Inventory.tsx`.
- A `PostToolUse` hook (`scripts/hook-validate-games.mjs`) blocks edits that introduce invalid JSON, duplicate ids, or recipes referencing unknown items.
