export type ItemCategory =
  | 'raw'
  | 'component'
  | 'tool'
  | 'equipment'
  | 'upgrade'
  | 'vehicle'
  | 'base'
  | 'consumable'

export interface Item {
  id: string
  name: string
  category: ItemCategory
  sources?: string[]
  biomes?: string[]
  craftedAt?: string
  notes?: string
}

export interface RecipeInput {
  itemId: string
  qty: number
}

export interface Recipe {
  outputId: string
  outputQty: number
  inputs: RecipeInput[]
}

export interface Game {
  id: string
  name: string
  craftStations?: string[]
  items: Item[]
  recipes: Recipe[]
}
