#!/usr/bin/env node
import 'source-map-support/register'
import * as path from 'path'
import { config } from 'dotenv'
import { App } from 'aws-cdk-lib'
import { LoadoutStack } from '../lib/loadout-stack'

config({ path: path.resolve(__dirname, '../local.env') })

function requireEnv(name: string): string {
  const val = process.env[name]
  if (!val) throw new Error(`Missing required env var: ${name} — copy local.env.example to local.env and fill it in.`)
  return val
}

const app = new App()

new LoadoutStack(app, 'LoadoutStack', {
  env: {
    account: requireEnv('CDK_ACCOUNT'),
    region: requireEnv('CDK_REGION'),
  },
  description: 'Static hosting for loadout.whoiskevinrich.net (S3 + CloudFront + Route 53)',
  domainName: requireEnv('DOMAIN_NAME'),
  zoneName: requireEnv('ZONE_NAME'),
  // ACM cert lives in us-east-1 (required by CloudFront); imported by ARN here.
  certificateArn: requireEnv('CERTIFICATE_ARN'),
  webDistPath: '../../apps/web/dist',
})
