# ADR 0001: Client-only architecture (no backend)

**Status:** Accepted
**Date:** 2026-05-23

## Context

Loadout tracks crafting build queues for survival games. Usage pattern: one player, one or two devices, occasional long sessions while playing. The tool needs to persist queues, inventory, and project allocations between sessions.

Real constraints:

- Personal-scale traffic (one user; family/friend distribution at most)
- Operator (the project owner) is highly cost-sensitive: target zero ongoing monthly cost
- No user accounts wanted — friction for a tool you bounce in and out of mid-game
- No real-time collaboration needed

## Decision

Build as a pure static SPA. All user state lives in the browser via IndexedDB. No backend, no API, no authentication, no database server. Cross-device sync is handled by an explicit export/import JSON button rather than automatic sync.

## Alternatives considered

- **Serverless backend (Lambda + DynamoDB + Cognito)** — adds auth flows, cold-start latency, billing surface, ~weeks of setup. Multi-device sync wasn't actually requested; cost would be near-zero but operational complexity is not.
- **Local-first with sync (Replicache, ElectricSQL, etc.)** — best of both worlds technically, but each adds either a managed service cost or a self-hosted server. Premature for a single-user tool.
- **Browser-only with no persistence (URL-encoded state)** — would mean losing state on tab close. Unacceptable for sessions that span days of gameplay.

## Consequences

**Positive**

- Zero monthly server cost. Hosting is the only line item (see [ADR 0003](0003-static-hosting-s3-cloudfront-cdk.md)).
- No auth code, no password resets, no GDPR data-export request paths to wire up.
- Offline-capable by default — the app works without network after first load.
- Privacy by construction — user data never leaves their browser.

**Negative**

- No automatic cross-device sync. Switching from desktop to mobile mid-session requires manual export/import.
- No cloud backup. Wiping the browser profile destroys all state. Mitigation: prominent export/import in Settings.
- Schema migrations happen in every user's browser independently — bugs are harder to recall (see [ADR 0002](0002-indexeddb-via-dexie.md) for how we manage this).
- Telemetry / usage analytics would require adding a backend; deliberately deferred.

**Implications for future features**

- Multiplayer or sharing features will require revisiting this ADR.
- "Recovered last 7 days" or similar undo across sessions requires growing IndexedDB schema rather than calling a server.
