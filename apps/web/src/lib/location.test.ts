import { describe, it, expect } from 'vitest'
import { locationString } from './location'
import type { Item } from '../games/types'

const item = (sources?: string[], biomes?: string[]): Item => ({
  id: 'x',
  name: 'X',
  category: 'raw',
  sources,
  biomes,
})

describe('locationString', () => {
  it('returns empty for undefined item', () => {
    expect(locationString(undefined)).toBe('')
  })

  it('returns empty when neither sources nor biomes are set', () => {
    expect(locationString(item())).toBe('')
  })

  it('joins sources only', () => {
    expect(locationString(item(['Limestone Outcrop', 'Metal Salvage']))).toBe(
      'Limestone Outcrop, Metal Salvage',
    )
  })

  it('joins biomes only', () => {
    expect(locationString(item(undefined, ['Safe Shallows', 'Kelp Forest']))).toBe(
      'Safe Shallows, Kelp Forest',
    )
  })

  it('joins sources and biomes separated by em-dash', () => {
    expect(locationString(item(['Limestone Outcrop'], ['Safe Shallows']))).toBe(
      'Limestone Outcrop — Safe Shallows',
    )
  })

  it('treats empty arrays as missing', () => {
    expect(locationString(item([], []))).toBe('')
  })
})
