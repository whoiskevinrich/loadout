import Dexie, { type Table } from 'dexie'

export interface InventoryRow {
  itemId: string
  count: number
}

export interface QueueRow {
  id: string
  itemId: string
  qty: number
  addedAt: number
  completed: 0 | 1
  position: number
  progress: Record<string, boolean>
  projectId?: string
}

export interface BuildLogRow {
  id: string
  itemId: string
  qty: number
  completedAt: number
}

export interface SettingRow {
  key: string
  value: unknown
}

export interface ProjectRow {
  id: string
  name: string
  position: number
  archived: 0 | 1
  createdAt: number
}

export interface AllocationRow {
  /** Composite key: `${projectId}|${itemId}` */
  id: string
  projectId: string
  itemId: string
  count: number
}

export function allocationId(projectId: string, itemId: string): string {
  return `${projectId}|${itemId}`
}

class LoadoutDB extends Dexie {
  inventory!: Table<InventoryRow, string>
  queue!: Table<QueueRow, string>
  buildLog!: Table<BuildLogRow, string>
  settings!: Table<SettingRow, string>
  projects!: Table<ProjectRow, string>
  allocations!: Table<AllocationRow, string>

  constructor() {
    super('loadout')

    this.version(1).stores({
      inventory: 'itemId',
      queue: 'id, itemId, addedAt, completed',
      buildLog: 'id, itemId, completedAt',
      settings: 'key',
    })

    this.version(2)
      .stores({
        inventory: 'itemId',
        queue: 'id, itemId, addedAt, completed, position',
        buildLog: 'id, itemId, completedAt',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        let i = 0
        await tx
          .table('queue')
          .toCollection()
          .modify((row) => {
            row.position = i++
            if (!row.progress) row.progress = {}
          })
      })

    this.version(3).stores({
      inventory: 'itemId',
      queue: 'id, itemId, addedAt, completed, position, projectId',
      buildLog: 'id, itemId, completedAt',
      settings: 'key',
      projects: 'id, name, position, archived',
      allocations: 'id, projectId, itemId, [projectId+itemId]',
    })
  }
}

export const db = new LoadoutDB()
