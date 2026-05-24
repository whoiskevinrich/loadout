# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Static SPA for tracking crafting build queues in survival games (Subnautica first). pnpm monorepo: `apps/web` (Vite + React + TS + Tailwind v4 + Dexie/IndexedDB) and `infra/cdk` (AWS CDK). All user state is local in IndexedDB — no backend.

Deploy target: `https://loadout.whoiskevinrich.net` (S3 + CloudFront in `us-west-2`; ACM cert pre-existing in `us-east-1`).

## Commands

- `pnpm dev` — Vite dev server at http://localhost:5173
- `pnpm build` — typecheck + build web app (`tsc --noEmit && vite build`)
- `pnpm typecheck` — typecheck both workspaces. **This is the only quality gate. No tests, ESLint, or Prettier exist — do not pretend they do.**
- `pnpm deploy` — builds web, then `cdk deploy` from `infra/cdk`. Requires AWS creds for account `514008367433`: run `assume whoiskevinrich/AWSPowerUserAccess` first.

## Workflow preferences

- **Plan first for non-trivial changes** (new screens, schema migrations, refactors): lay out the data model + file list + build sequence and wait for approval before writing code.
- **Verify recipes against the Subnautica wiki** (`https://subnautica.fandom.com/wiki/`) before adding or editing entries in `apps/web/src/games/subnautica.json`. If a user-stated recipe contradicts the wiki, flag it inline rather than silently picking one.

## Editing rules

- **`apps/web/src/games/subnautica.json`** is hand-curated with column-aligned fields. Use **Edit** for surgical additions — never rewrite the whole file (alignment will be lost). Item ids are kebab-case; categories are restricted to the `ItemCategory` union in `apps/web/src/games/types.ts`.
- **`apps/web/src/db/schema.ts` Dexie versioning**: never modify existing `this.version(N).stores(...)` blocks. Add `this.version(N+1)` with an `.upgrade()` callback that backfills any new fields on existing rows. Editing an old version corrupts users' IndexedDB.
- **Tailwind v4** — there is no `tailwind.config.{js,ts}` and there shouldn't be. Theme tokens live in `apps/web/src/index.css` under `@theme { --color-* }`.

## CDK / deploy

- The ACM cert in `infra/cdk/bin/loadout.ts` is in `us-east-1` (CloudFront requirement); the stack deploys to `us-west-2`. The cross-region split is intentional — the cert is imported by ARN, not created in-stack.
- Account `514008367433` and region `us-west-2` are hardcoded in `infra/cdk/bin/loadout.ts`.
- CloudFront error responses rewrite 404/403 → `/index.html` (200) to support client-side routes like `/gathering`, `/inventory`, `/projects`. Preserve this if touching the stack.
- The web app must be built before `cdk deploy` (the `pnpm deploy` script chains this). Running `cdk deploy` directly without a fresh `apps/web/dist` will fail or upload stale assets.

## App quirks

- The active project filter is persisted in `localStorage` key `loadout:projectFilter`. Sentinel values: `null` = "All projects", literal string `'unassigned'` = "no project", any other string is a project id.
- `apps/web/src/lib/rollup.ts` uses a per-path `stack` Set to short-circuit recipe cycles (A→B→A). Don't replace it with a global visited set — shared subtrees would stop expanding.
- React `StrictMode` is enabled; effects double-fire in dev. Don't chase phantom mount/unmount loops.
- Allocation invariant: `inventory[itemId] ≥ sum of allocations[itemId]`. Mutation paths in `Gathering.tsx` (`markGathered`) and `Inventory.tsx` (`setAllocationExact`) auto-bump global stock when allocations grow. The All-Projects inventory editor can still violate this — that's the source of the `⚠ over` warning.
