# Loadout

Static web app for managing crafting build queues for survival games. Starts with Subnautica; designed to extend to other games (No Man's Sky next) as data-only additions.

All user state lives in the browser via IndexedDB (Dexie). No backend, no accounts. Export/import a JSON file for cross-device.

## Layout

```
apps/web         Vite + React + TS + Tailwind app
infra/cdk        AWS CDK stack (S3 + CloudFront + Route 53)
```

## Local dev

```bash
pnpm install
pnpm dev
```

Vite dev server defaults to http://localhost:5173.

## Deploy

Requires AWS credentials for account `514008367433`. Assume the role first:

```bash
assume whoiskevinrich/AWSPowerUserAccess
pnpm deploy
```

This builds the web app and runs `cdk deploy` against the `LoadoutStack` in `us-west-2`. The site lands at https://loadout.whoiskevinrich.net.

## Adding a game

1. Drop a new file at `apps/web/src/games/<game-id>.json` matching the shape in `src/games/types.ts`.
2. Register it in `src/games/index.ts`.
3. The UI will pick it up automatically.
