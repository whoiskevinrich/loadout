#!/usr/bin/env node
// Hook: PostToolUse Write|Edit
// Two silent post-edit chores:
//   1. Run `prettier --write --ignore-unknown` on the edited file. Respects
//      .prettierignore (which excludes apps/web/src/games/subnautica.json
//      because that file is hand-aligned).
//   2. If the edited file is .ts/.tsx, drop a flag file the Stop hook reads
//      to decide whether to run pnpm typecheck this turn.

import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const chunks = []
process.stdin.on('data', (c) => chunks.push(c))
process.stdin.on('end', () => {
  let payload
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    process.exit(0)
  }

  const filePath = payload.tool_input?.file_path ?? payload.tool_response?.filePath
  const sessionId = payload.session_id ?? 'unknown'
  if (!filePath) process.exit(0)

  // 1. Format silently — failures shouldn't block edits. Command-string form
  // (args inlined) avoids Node 22's DEP0190 deprecation warning for
  // spawnSync(args, { shell: true }).
  spawnSync(`pnpm exec prettier --write "${filePath}" --ignore-unknown`, {
    shell: true,
    stdio: 'ignore',
  })

  // 2. Mark typecheck pending if this was a TS/TSX edit.
  if (/\.(ts|tsx)$/.test(filePath)) {
    const flagPath = `.claude/.typecheck-pending-${sessionId}`
    try {
      mkdirSync(dirname(flagPath), { recursive: true })
      writeFileSync(flagPath, '')
    } catch {
      // best-effort
    }
  }
})
