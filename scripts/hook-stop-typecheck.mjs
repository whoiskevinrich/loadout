#!/usr/bin/env node
// Hook: Stop
// If the post-edit-cleanup hook dropped a typecheck flag this session
// (meaning we touched .ts or .tsx), run `pnpm typecheck` and block the
// turn with the last ~2KB of error output if it fails. The flag is
// consumed on read so this only runs once per session-with-TS-edits.

import { existsSync, unlinkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const chunks = []
process.stdin.on('data', (c) => chunks.push(c))
process.stdin.on('end', () => {
  let payload
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    process.exit(0)
  }

  const sessionId = payload.session_id ?? 'unknown'
  const flagPath = `.claude/.typecheck-pending-${sessionId}`
  if (!existsSync(flagPath)) process.exit(0)

  try {
    unlinkSync(flagPath)
  } catch {
    // ignore
  }

  const result = spawnSync('pnpm typecheck', {
    shell: true,
    stdio: 'pipe',
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    const tail = ((result.stdout ?? '') + (result.stderr ?? '')).slice(-2000)
    console.log(
      JSON.stringify({
        decision: 'block',
        reason: `pnpm typecheck failed after this turn's edits:\n\n${tail}`,
        systemMessage: 'TypeScript errors after edits — see typecheck output',
      }),
    )
  }
})
