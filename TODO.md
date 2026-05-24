# TODO

[ ] Update game recipes with output qty. For example
    - `silicone-rubber` is currently 1:1 with `creepvine-seed-cluster`, but the game actually gives 2 rubber per cluster. This is a common pattern where the output qty > 1, and it matters for accurate loadout math.
    - Known recipes with output qty > 1: 
        - `silicone-rubber` -> 2x
        - `fiber-mesh`
        - `computer-chip`
        - `titanium-ingot`

[ ] Manually verify...
    - Vehicles: modules, upgrades, and plands
    - torpedoes: all 4 types, with and without the depth module
    - 

## Setup

- [ ] **Refine skills with skill-creator.** `skill-creator` is installed. Run `/reload-plugins`, then `/skill-creator add-catalog-items` and `/skill-creator deploy-loadout` to tighten triggering accuracy and add evals.
- [ ] **Install Playwright plugin.** `/plugin install playwright@claude-plugins-official` — gives Claude a real browser to drive, screenshot the running app, and self-correct visual bugs.
- [ ] **Install commit-push-pr plugin.** `/plugin install commit-push-pr@claude-plugins-official` (after `git init` — see below) — automates the commit → push → open-PR loop.

## Repo hygiene

- [X] **`git init`** (still not a git repo). Without this, no version control, and `/deploy-loadout` can't snapshot what's being shipped.

## Code-review CDK follow-ups (require deploy approval)

These four CDK findings from the high-effort review weren't fixed in the app-layer pass — they affect live infra. Address before the next prod deploy.

- [ ] **errorResponses 5min TTL poisons SPA chunk URLs** (`infra/cdk/lib/loadout-stack.ts:56`). Pruned `/assets/*.js` 404s get cached as `/index.html` for 5min, breaking every user behind that edge. Fix: scope the error mapping to navigation paths only, or drop `prune: true`.
- [ ] **`BucketDeployment` `prune: true`** (`infra/cdk/lib/loadout-stack.ts:87`). Active sessions break on lazy-loaded chunks the moment a deploy lands. Switch to `prune: false` (accept some S3 cost) or add an S3 lifecycle rule to keep old hashed assets for N days.
- [ ] **`RemovalPolicy.RETAIN` + versioned bucket + no `autoDeleteObjects`** (`infra/cdk/lib/loadout-stack.ts:34`). `cdk destroy` orphans the bucket and accumulates versions forever. Add `autoDeleteObjects: true` for personal-scale, or document a teardown runbook.
- [ ] **`HostedZone.fromLookup` silently returns dummy without route53 perms** (`infra/cdk/bin/loadout.ts:17`). Bad creds → ARecord points nowhere. Either harden the deploy role or switch to `HostedZone.fromHostedZoneAttributes` with the explicit zone id.

## Future work

- [ ] **LexoRank-style queue positions.** The current fractional midpoint scheme (`apps/web/src/routes/Queue.tsx` `commitDrop`) exhausts Float64 precision after ~52 same-slot drops. Replace with a lexicographic string ordering (e.g. `lexorank` or roll your own) when the user actually approaches that limit.
- [ ] **Multi-tab project-filter sync.** `apps/web/src/lib/projectFilter.tsx` only reads localStorage on mount. Tabs can diverge. Subscribe to the `storage` event for tab-to-tab consistency.
- [ ] **Suppress remaining ESLint warnings or audit them periodically.** The `useLiveArray` helper eliminated the original 15. Re-check on each major refactor.
