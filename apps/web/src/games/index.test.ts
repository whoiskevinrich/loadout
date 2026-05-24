import { describe, it, expect } from 'vitest'
import { craftableItems, getItem, getRecipe, isRaw } from './index'
import type { Game } from './types'

const G: Game = {
  id: 'test',
  name: 'Test',
  items: [
    { id: 'wood', name: 'Wood', category: 'raw' },
    { id: 'stone', name: 'Stone', category: 'raw' },
    { id: 'plank', name: 'Plank', category: 'component' },
  ],
  recipes: [{ outputId: 'plank', outputQty: 1, inputs: [{ itemId: 'wood', qty: 2 }] }],
}

describe('getItem', () => {
  it('returns the item by id', () => {
    expect(getItem(G, 'wood')?.name).toBe('Wood')
  })
  it('returns undefined for unknown id', () => {
    expect(getItem(G, 'missing')).toBeUndefined()
  })
})

describe('getRecipe', () => {
  it('returns recipe by output id', () => {
    expect(getRecipe(G, 'plank')?.inputs[0]?.qty).toBe(2)
  })
  it('returns undefined for items without a recipe', () => {
    expect(getRecipe(G, 'wood')).toBeUndefined()
  })
})

describe('isRaw', () => {
  it('is true for items without a recipe', () => {
    expect(isRaw(G, 'wood')).toBe(true)
    expect(isRaw(G, 'stone')).toBe(true)
  })
  it('is false for craftable items', () => {
    expect(isRaw(G, 'plank')).toBe(false)
  })
})

describe('craftableItems', () => {
  it('returns only items that have a recipe', () => {
    expect(craftableItems(G).map((i) => i.id)).toEqual(['plank'])
  })
})
