import type { Game } from '../games/types'
import { getRecipe } from '../games'

export interface RollupOptions {
  /**
   * Per-entry checkmarks: items the user has marked as already handled.
   * Any item present (with value true) contributes 0 to the rollup —
   * a checked component prunes its entire subtree, a checked raw material
   * is just excluded from the totals.
   */
  progress?: Record<string, boolean>
  /** Internal: tracks the current recursion stack for cycle detection. */
  stack?: Set<string>
}

/**
 * Recursively expand an item into raw-material totals.
 * Cycle-safe via a stack-tracked visited set (A→B→A returns empty for the cyclic branch).
 */
export function rollupRawMaterials(
  game: Game,
  itemId: string,
  qty: number,
  options: RollupOptions = {},
): Map<string, number> {
  const progress = options.progress ?? {}
  const stack = options.stack ?? new Set<string>()

  if (progress[itemId]) return new Map()
  if (stack.has(itemId)) return new Map()

  const recipe = getRecipe(game, itemId)
  if (!recipe) {
    return new Map([[itemId, qty]])
  }

  stack.add(itemId)
  try {
    const batches = Math.ceil(qty / recipe.outputQty)
    const result = new Map<string, number>()
    for (const input of recipe.inputs) {
      const sub = rollupRawMaterials(game, input.itemId, input.qty * batches, { progress, stack })
      for (const [k, v] of sub) {
        result.set(k, (result.get(k) ?? 0) + v)
      }
    }
    return result
  } finally {
    stack.delete(itemId)
  }
}

/**
 * Aggregate raw-material requirements across many queued items.
 * Each entry may carry its own progress map (per-entry checkmarks).
 */
export function rollupQueue(
  game: Game,
  entries: Array<{ itemId: string; qty: number; progress?: Record<string, boolean> }>,
): Map<string, number> {
  const result = new Map<string, number>()
  for (const entry of entries) {
    const sub = rollupRawMaterials(game, entry.itemId, entry.qty, { progress: entry.progress })
    for (const [k, v] of sub) {
      result.set(k, (result.get(k) ?? 0) + v)
    }
  }
  return result
}

export interface BuildNode {
  itemId: string
  qty: number
  isRaw: boolean
  isCycle?: boolean
  children: BuildNode[]
}

export interface ComponentSummary {
  itemId: string
  qty: number
  /** Depth in the crafting tree; higher = craft earlier (it feeds shallower components). */
  tier: number
}

/**
 * Collect all intermediate (non-raw) components needed across a queue.
 * Excludes the queue items themselves (roots). Sorted deepest-tier first so
 * the list reads bottom-up: craft these in order to satisfy the queue.
 */
export function collectComponents(
  game: Game,
  entries: Array<{ itemId: string; qty: number }>,
): ComponentSummary[] {
  const acc = new Map<string, ComponentSummary>()
  for (const entry of entries) {
    const tree = buildTree(game, entry.itemId, entry.qty)
    gatherNonRaw(tree.children, acc, 1)
  }
  return [...acc.values()].sort((a, b) => b.tier - a.tier || a.itemId.localeCompare(b.itemId))
}

function gatherNonRaw(nodes: BuildNode[], acc: Map<string, ComponentSummary>, tier: number): void {
  for (const node of nodes) {
    if (!node.isRaw) {
      const existing = acc.get(node.itemId)
      if (existing) {
        existing.qty += node.qty
        if (tier > existing.tier) existing.tier = tier
      } else {
        acc.set(node.itemId, { itemId: node.itemId, qty: node.qty, tier })
      }
    }
    gatherNonRaw(node.children, acc, tier + 1)
  }
}

/**
 * Build a recursive requirements tree for one queued item.
 * Quantities at each node are already multiplied by parent batches.
 * Cycles short-circuit by emitting the node as a leaf.
 */
export function buildTree(
  game: Game,
  itemId: string,
  qty: number,
  stack: Set<string> = new Set(),
): BuildNode {
  const recipe = getRecipe(game, itemId)
  if (!recipe || stack.has(itemId)) {
    return { itemId, qty, isRaw: true, children: [] }
  }
  stack.add(itemId)
  try {
    const batches = Math.ceil(qty / recipe.outputQty)
    const children = recipe.inputs.map((input) =>
      buildTree(game, input.itemId, input.qty * batches, stack),
    )
    return { itemId, qty, isRaw: false, children }
  } finally {
    stack.delete(itemId)
  }
}
