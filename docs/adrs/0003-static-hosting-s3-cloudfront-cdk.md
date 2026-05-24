# ADR 0003: Static hosting on S3 + CloudFront via AWS CDK

**Status:** Accepted
**Date:** 2026-05-23

## Context

The app is a static SPA ([ADR 0001](0001-client-only-architecture.md)) deployed to a custom domain (`loadout.whoiskevinrich.net`). The operator already runs an AWS account and has the parent zone in Route 53. Cost sensitivity is high — target is single-digit dollars per year.

## Decision

- **Storage:** S3 bucket, private, OAC-locked (Origin Access Control), versioned, `RemovalPolicy.RETAIN`
- **CDN:** CloudFront distribution with HTTPS via an existing ACM certificate, `PRICE_CLASS_100` (US + Europe edges)
- **DNS:** Route 53 alias record managed by the same CDK stack
- **IaC:** AWS CDK in TypeScript, single stack (`LoadoutStack`)
- **Region:** stack deploys to `us-west-2`; certificate is imported by ARN from `us-east-1` (CloudFront-required)
- **Deploy:** `BucketDeployment` construct uploads `apps/web/dist`, then triggers a `/*` CloudFront invalidation

## Alternatives considered

- **AWS Amplify Hosting** — slick git-push-to-deploy, but a markup over the same S3+CloudFront primitives and less control over caching/headers/error responses. Not worth the cost for a personal project.
- **Vercel / Netlify / Cloudflare Pages** — excellent DX, free tier covers personal use, but pulls hosting outside the operator's existing AWS footprint and adds another vendor relationship.
- **GitHub Pages** — free, but limited control over custom-domain TLS, caching, and routing. SPA fallback (404 → index.html) is awkward.
- **CloudFront Hosting (no S3, signed URLs from Lambda)** — overengineered.

## Consequences

**Positive**

- At personal traffic, total cost is < $1/month (Route 53 hosted zone is the dominant line item). CloudFront free tier covers requests and data transfer.
- Full control over caching headers, error responses, and TLS configuration.
- Single CloudFormation stack — `cdk destroy` cleans up DNS + CDN (though the bucket is RETAIN'd; see TODO.md).

**Negative**

- **Cross-region cert handling.** Cert must be in `us-east-1` (CloudFront constraint), but the stack runs in `us-west-2`. Imported by ARN, which works without `crossRegionReferences`, but new operators will be confused — documented in CLAUDE.md.
- **SPA cache-poisoning risk.** CloudFront `errorResponses` map 404/403 to `/index.html` (200) to support client-side React Router routes. Combined with `BucketDeployment.prune: true`, a deploy can leave stale clients requesting deleted hashed chunks, and the 5-min error-response TTL caches the HTML response for that chunk URL across the whole POP. Currently a known issue (see `TODO.md`).
- **`RemovalPolicy.RETAIN` + versioned bucket without `autoDeleteObjects`** — `cdk destroy` orphans the bucket. Acceptable given low data volume, but flagged in TODO.md for hardening.
- **`HostedZone.fromLookup` silent failure.** If `cdk synth` runs without route53 read permissions, it returns a dummy zone id; deploy fails with `NoSuchHostedZone`. Operators must use a role with the right permissions or switch to `fromHostedZoneAttributes` with the explicit zone id.

## Hardcoded constants

These live in `infra/cdk/bin/loadout.ts` and aren't extracted to config — there's only one deploy target:

- Account: `514008367433`
- Region: `us-west-2`
- Domain: `loadout.whoiskevinrich.net`
- Cert ARN: `arn:aws:acm:us-east-1:514008367433:certificate/5477ae92-7cad-40e1-92a0-2b7662aa4875`
