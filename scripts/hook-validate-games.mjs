#!/usr/bin/env node
// Hook: PostToolUse Write|Edit
// Validates games/*.json after every edit. Blocks Claude when:
//   - JSON is unparseable
//   - items[] is missing
//   - any item id is duplicated
//   - any recipe outputId is duplicated
//   - any recipe targets or references an unknown item id
//
// Silent on success; emits decision:block JSON on failure.

import { readFileSync } from 'node:fs'

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
  if (!filePath) process.exit(0)

  const normalized = filePath.replace(/\\/g, '/')
  if (!/\/apps\/web\/src\/games\/[^/]+\.json$/.test(normalized)) process.exit(0)

  const block = (msg) => {
    console.log(
      JSON.stringify({
        decision: 'block',
        reason: msg,
        systemMessage: msg,
      }),
    )
    process.exit(0)
  }

  let data
  try {
    data = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (e) {
    return block(`Invalid JSON in ${filePath}: ${e.message}`)
  }

  if (!Array.isArray(data.items)) {
    return block(`${filePath}: missing items[] array`)
  }

  const ids = data.items.map((i) => i.id)
  const dupItems = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (dupItems.length) {
    return block(`Duplicate item ids in ${filePath}: ${[...new Set(dupItems)].join(', ')}`)
  }

  if (Array.isArray(data.recipes)) {
    const itemSet = new Set(ids)
    const outIds = data.recipes.map((r) => r.outputId)
    const dupR = outIds.filter((id, i) => outIds.indexOf(id) !== i)
    if (dupR.length) {
      return block(`Duplicate recipe outputIds in ${filePath}: ${[...new Set(dupR)].join(', ')}`)
    }
    const unknownOut = outIds.filter((id) => !itemSet.has(id))
    if (unknownOut.length) {
      return block(`Recipes target unknown items in ${filePath}: ${unknownOut.join(', ')}`)
    }
    for (const r of data.recipes) {
      for (const inp of r.inputs ?? []) {
        if (!itemSet.has(inp.itemId)) {
          return block(
            `Recipe '${r.outputId}' references unknown input id '${inp.itemId}' in ${filePath}`,
          )
        }
      }
    }
  }
})
