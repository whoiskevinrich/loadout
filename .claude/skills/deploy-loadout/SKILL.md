---
name: deploy-loadout
description: Deploy the loadout web app to https://loadout.whoiskevinrich.net via AWS CDK. Handles AWS role assumption, builds the web bundle, runs cdk deploy, and surfaces the post-deploy state (CloudFront domain, invalidation status). Use only when the user explicitly asks to deploy — never run automatically.
disable-model-invocation: true
---

# Deploying loadout

User-invoked workflow. Pushes a real production deploy to AWS account `514008367433` — Claude must not run this on its own.

## Preflight

Confirm with the user before any AWS calls:

1. **Working state**: any uncommitted changes the user wants to include? Run `git status` if the repo is initialized; otherwise note that there's no git tracking and confirm the local files reflect what they want shipped.
2. **Typecheck + build clean**: run `pnpm typecheck` and `pnpm build`. If either fails, stop and report — do not deploy a broken bundle.
3. **AWS credentials**: confirm the user has assumed the right role. Run `aws sts get-caller-identity 2>&1` to verify. If it errors or returns the wrong account, prompt the user to run `assume whoiskevinrich/AWSPowerUserAccess` themselves (Claude can't drive an interactive credential broker).

## Deploy

Once preflight is clean:

1. From the repo root: `pnpm deploy`. This chains `pnpm --filter @loadout/web build && pnpm --filter @loadout/cdk deploy --require-approval never`.
2. Watch for `cdk deploy` output. Capture the stack outputs (`SiteUrl`, `DistributionDomain`, `DistributionId`, `BucketName`).
3. CloudFront invalidation runs as part of `BucketDeployment`. Note the invalidation id from the deploy output if visible.

## Post-deploy

1. **Smoke-test the live URL**: `curl -sI https://loadout.whoiskevinrich.net | head -5`. Confirm 200 and `content-type: text/html`.
2. **Hashed asset check**: extract one of the new asset hashes from `apps/web/dist/index.html` (e.g., `assets/index-XXXXX.js`) and curl it: `curl -sI https://loadout.whoiskevinrich.net/assets/index-XXXXX.js`. Confirm 200 and `content-type: application/javascript` (or `text/javascript`). If you get HTML back, the CloudFront error-response cache is poisoned with a stale chunk — flag this; the user may need to wait for the 5-minute TTL or issue a manual invalidation.
3. **Report**: paste the SiteUrl, the invalidation id, and the smoke-test results.

## Failure modes to flag

- `aws sts get-caller-identity` returns a different account → wrong role assumed; stop.
- `cdk deploy` fails with `NoSuchHostedZone` → `HostedZone.fromLookup` returned a dummy value because the AWS creds lack `route53:ListHostedZonesByName`. Tell the user to widen their role's permissions.
- Smoke test returns HTML for a `.js` asset → SPA chunk cache poisoning (see CLAUDE.md note). Trigger a manual invalidation: `aws cloudfront create-invalidation --distribution-id <id> --paths '/*'`.
- Typecheck or build fails → fix locally and re-run; do not deploy broken code.
