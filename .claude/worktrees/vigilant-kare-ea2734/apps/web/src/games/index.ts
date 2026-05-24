import type { Game, Item, Recipe } from './types'
import subnauticaData from './subnautica.json'

const subnautica = subnauticaData as Game

export const GAMES: Record<string, Game> = {
  subnautica,
}

export function getActiveGame(): Game {
  return subnautica
}

export function getItem(game: Game, itemId: string): Item | undefined {
  return game.items.find((i) => i.id === itemId)
}

export function getRecipe(game: Game, itemId: string): Recipe | undefined {
  return game.recipes.find((r) => r.outputId === itemId)
}

export function isRaw(game: Game, itemId: string): boolean {
  return getRecipe(game, itemId) === undefined
}

export function craftableItems(game: Game): Item[] {
  const recipeIds = new Set(game.recipes.map((r) => r.outputId))
  return game.items.filter((i) => recipeIds.has(i.id))
}
