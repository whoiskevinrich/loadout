import { describe, it, expect } from 'vitest'
import { buildTree, rollupQueue, rollupRawMaterials } from './rollup'
import type { Game } from '../games/types'

const G: Game = {
  id: 'test',
  name: 'Test',
  items: [
    { id: 'wood', name: 'Wood', category: 'raw' },
    { id: 'stone', name: 'Stone', category: 'raw' },
    { id: 'plank', name: 'Plank', category: 'component' },
    { id: 'house', name: 'House', category: 'base' },
    { id: 'a', name: 'A', category: 'component' },
    { id: 'b', name: 'B', category: 'component' },
    { id: 'broken', name: 'Broken', category: 'component' },
  ],
  recipes: [
    { outputId: 'plank', outputQty: 1, inputs: [{ itemId: 'wood', qty: 2 }] },
    {
      outputId: 'house',
      outputQty: 1,
      inputs: [
        { itemId: 'plank', qty: 4 },
        { itemId: 'stone', qty: 5 },
      ],
    },
    // Cycle: a → b → a
    { outputId: 'a', outputQty: 1, inputs: [{ itemId: 'b', qty: 1 }] },
    { outputId: 'b', outputQty: 1, inputs: [{ itemId: 'a', qty: 1 }] },
    // Malformed: outputQty=0 (division-by-zero trap)
    { outputId: 'broken', outputQty: 0, inputs: [{ itemId: 'wood', qty: 1 }] },
  ],
}

describe('rollupRawMaterials', () => {
  it('returns the item itself for a raw material', () => {
    expect([...rollupRawMaterials(G, 'wood', 5)]).toEqual([['wood', 5]])
  })

  it('expands a one-level recipe', () => {
    expect([...rollupRawMaterials(G, 'plank', 1)]).toEqual([['wood', 2]])
  })

  it('multiplies inputs by batches', () => {
    // 3 planks = 3 batches × 2 wood
    expect([...rollupRawMaterials(G, 'plank', 3)]).toEqual([['wood', 6]])
  })

  it('recursively expands multi-level recipes', () => {
    // 1 house = 4 planks + 5 stone = 8 wood + 5 stone
    expect(Object.fromEntries(rollupRawMaterials(G, 'house', 1))).toEqual({
      wood: 8,
      stone: 5,
    })
  })

  it('aggregates the same raw across separate branches', () => {
    // 2 houses = 8 planks + 10 stone = 16 wood + 10 stone
    expect(Object.fromEntries(rollupRawMaterials(G, 'house', 2))).toEqual({
      wood: 16,
      stone: 10,
    })
  })

  it('returns empty when the queried item is in progress', () => {
    expect(rollupRawMaterials(G, 'plank', 1, { progress: { plank: true } }).size).toBe(0)
  })

  it('prunes a subtree when an intermediate component is in progress', () => {
    // House w/ plank checked off → only stone remains
    expect(
      Object.fromEntries(rollupRawMaterials(G, 'house', 1, { progress: { plank: true } })),
    ).toEqual({ stone: 5 })
  })

  it('returns empty for a cyclic chain (cycle guard)', () => {
    expect(rollupRawMaterials(G, 'a', 1).size).toBe(0)
  })

  it('treats outputQty=0 as a raw leaf (no Infinity propagation)', () => {
    const result = rollupRawMaterials(G, 'broken', 5)
    expect([...result]).toEqual([['broken', 5]])
    for (const v of result.values()) {
      expect(Number.isFinite(v)).toBe(true)
    }
  })
})

describe('rollupQueue', () => {
  it('sums across entries', () => {
    const result = rollupQueue(G, [
      { itemId: 'plank', qty: 1 },
      { itemId: 'plank', qty: 2 },
    ])
    expect(Object.fromEntries(result)).toEqual({ wood: 6 })
  })

  it('respects per-entry progress independently', () => {
    // entry-1's plank is checked → its 2 wood are pruned
    // entry-2 still contributes 4 wood
    const result = rollupQueue(G, [
      { itemId: 'plank', qty: 1, progress: { plank: true } },
      { itemId: 'plank', qty: 2 },
    ])
    expect(Object.fromEntries(result)).toEqual({ wood: 4 })
  })
})

describe('buildTree', () => {
  it('returns isRaw:true for a raw material', () => {
    expect(buildTree(G, 'wood', 5)).toEqual({
      itemId: 'wood',
      qty: 5,
      isRaw: true,
      children: [],
    })
  })

  it('returns a recursive tree for components', () => {
    const node = buildTree(G, 'house', 1)
    expect(node.isRaw).toBe(false)
    expect(node.qty).toBe(1)
    expect(node.children).toHaveLength(2)
    const plankNode = node.children[0]!
    const stoneNode = node.children[1]!
    expect(plankNode).toMatchObject({ itemId: 'plank', qty: 4, isRaw: false })
    expect(plankNode.children).toEqual([{ itemId: 'wood', qty: 8, isRaw: true, children: [] }])
    expect(stoneNode).toEqual({ itemId: 'stone', qty: 5, isRaw: true, children: [] })
  })

  it('marks cycle truncation with isCycle (not isRaw)', () => {
    // a → b → a: the second 'a' is the cycle node
    const root = buildTree(G, 'a', 1)
    expect(root.isRaw).toBe(false)
    const b = root.children[0]!
    expect(b.itemId).toBe('b')
    expect(b.isRaw).toBe(false)
    const cycleA = b.children[0]!
    expect(cycleA.itemId).toBe('a')
    expect(cycleA.isCycle).toBe(true)
    expect(cycleA.isRaw).toBe(false) // cycle is craftable, not a raw
    expect(cycleA.children).toEqual([])
  })

  it('treats outputQty=0 as a raw leaf (no Infinity propagation)', () => {
    expect(buildTree(G, 'broken', 1)).toEqual({
      itemId: 'broken',
      qty: 1,
      isRaw: true,
      children: [],
    })
  })
})
