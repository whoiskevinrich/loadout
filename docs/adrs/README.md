# Architecture Decision Records

ADRs in [Michael Nygard format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions). One file per decision. Status, Context, Decision, Alternatives Considered, Consequences.

Add a new ADR by creating `NNNN-kebab-case-title.md` with the next number and Status: Proposed; flip to Accepted once we've committed to it. To reverse an earlier ADR, write a new one and mark the old one Superseded.

## Index

| #                                                | Title                                         | Status   |
| ------------------------------------------------ | --------------------------------------------- | -------- |
| [0001](0001-client-only-architecture.md)         | Client-only architecture (no backend)         | Accepted |
| [0002](0002-indexeddb-via-dexie.md)              | IndexedDB via Dexie for user state            | Accepted |
| [0003](0003-static-hosting-s3-cloudfront-cdk.md) | Static hosting on S3 + CloudFront via AWS CDK | Accepted |
| [0004](0004-pnpm-workspaces-monorepo.md)         | pnpm workspaces monorepo                      | Accepted |
| [0005](0005-tailwind-v4.md)                      | Tailwind v4 with CSS-based theme              | Accepted |
| [0006](0006-hand-curated-game-data.md)           | Hand-curated game data in bundled JSON        | Accepted |
| [0007](0007-allocations-as-claims.md)            | Allocations as claims, not transfers          | Accepted |
| [0008](0008-fractional-queue-positions.md)       | Fractional positions for queue ordering       | Accepted |
