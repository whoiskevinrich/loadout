# ADR 0004: pnpm workspaces monorepo

**Status:** Accepted
**Date:** 2026-05-23

## Context

Two TypeScript codebases — the SPA and its AWS CDK infrastructure — that benefit from sharing tooling (TypeScript version, ESLint config, Prettier config) and deploying as a single unit (the CDK stack uploads the built web assets, so a deploy is "build then synth then push").

## Decision

Single repo, **pnpm workspaces**, layout:

```
apps/web        @loadout/web   — Vite + React + TS SPA
infra/cdk       @loadout/cdk   — AWS CDK stack
scripts/        Hook scripts and tooling (not a workspace)
```

Package manager pinned via `"packageManager": "pnpm@10.33.0"` in the root `package.json`. Root `tsconfig.base.json` is `extends`ed by each workspace.

## Alternatives considered

- **Separate repos** — one for app, one for infra. Overhead is real for a solo project: two `git pull`s, two CI configs, version-pinning the cert ARN in two places, an extra `npm link` dance for shared types. Rejected.
- **npm workspaces / yarn workspaces** — equivalent feature surface to pnpm workspaces. pnpm wins on installation speed (especially in CI) and strict dependency isolation (no accidental access to transitive deps). The user explicitly preferred pnpm.
- **Nx / Turborepo / Lerna** — task graph caching is overkill for two packages with no shared library between them.
- **Single flat package** (CDK code colocated in `apps/web`) — works mechanically but blurs boundaries; the IaC has different lifecycle (less frequent edits) and dependencies (`aws-cdk-lib` is huge).

## Consequences

**Positive**

- One `pnpm install` at the root pulls everything.
- Root-level scripts (`pnpm dev`, `pnpm build`, `pnpm deploy`, `pnpm lint`, `pnpm typecheck`, `pnpm test`) fan out to the right workspaces.
- Shared `tsconfig.base.json` keeps TS settings consistent.
- `pnpm deploy` correctly chains `pnpm --filter @loadout/web build && pnpm --filter @loadout/cdk deploy` so the CDK upload always sees fresh `dist/`.

**Negative**

- **pnpm-specific hoisting.** Packages live under `node_modules/.pnpm/...` and may not be visible to tools expecting npm-style flat `node_modules`. Affects some legacy build tools (hasn't hit us yet).
- **Mixing module systems.** Root and `apps/web` are `"type": "module"`; `infra/cdk` is not (CDK still runs CommonJS-style via `ts-node`). Lint and tooling configs need scoped overrides — done in `eslint.config.js`.
- **Lockfile churn.** A change in `apps/web` rewrites `pnpm-lock.yaml` at the root, which shows up in diffs for unrelated PRs.

## Convention

- Run commands from the repo root unless a workspace-specific path is needed.
- Add packages with `pnpm add --filter @loadout/web <name>` (or `--filter @loadout/cdk`).
- Don't add dependencies at the root unless they're genuinely workspace-wide tooling (ESLint, Prettier, TypeScript, Vitest's coordinator).
