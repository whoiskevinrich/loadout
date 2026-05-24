import type { Item } from '../games/types'

/**
 * Render an item's gathering location as a single human-readable string.
 * Combines `sources` (rock outcrops, salvage piles, etc.) with `biomes`
 * (where to dive). Returns empty string if neither is set.
 */
export function locationString(item: Item | undefined): string {
  if (!item) return ''
  const parts: string[] = []
  if (item.sources?.length) parts.push(item.sources.join(', '))
  if (item.biomes?.length) parts.push(item.biomes.join(', '))
  return parts.join(' — ')
}
