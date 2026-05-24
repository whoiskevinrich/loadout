import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { allocationId, db, type AllocationRow } from '../db/schema'
import { getActiveGame, getItem } from '../games'
import { rollupQueue } from '../lib/rollup'
import { locationString } from '../lib/location'
import { isRealProjectFilter, useProjectFilter } from '../lib/projectFilter'

export default function Gathering() {
  const game = getActiveGame()
  const { filter } = useProjectFilter()
  const allQueue = useLiveQuery(() => db.queue.where('completed').equals(0).toArray()) ?? []
  const inventoryRows = useLiveQuery(() => db.inventory.toArray()) ?? []
  const projects = useLiveQuery(() => db.projects.toArray()) ?? []
  const allocationRows =
    useLiveQuery<AllocationRow[]>(
      () =>
        isRealProjectFilter(filter)
          ? db.allocations.where('projectId').equals(filter).toArray()
          : Promise.resolve([]),
      [filter],
    ) ?? []

  const globalInventory = useMemo(
    () => new Map(inventoryRows.map((r) => [r.itemId, r.count])),
    [inventoryRows],
  )
  const allocations = useMemo(
    () => new Map(allocationRows.map((a) => [a.itemId, a.count])),
    [allocationRows],
  )
  const haveMap = isRealProjectFilter(filter) ? allocations : globalInventory

  const queueRows = useMemo(() => {
    if (filter === null) return allQueue
    if (filter === 'unassigned') return allQueue.filter((r) => !r.projectId)
    return allQueue.filter((r) => r.projectId === filter)
  }, [allQueue, filter])

  const needs = useMemo(
    () =>
      rollupQueue(
        game,
        queueRows.map((r) => ({ itemId: r.itemId, qty: r.qty, progress: r.progress })),
      ),
    [game, queueRows],
  )

  const rows = useMemo(() => {
    return [...needs.entries()]
      .map(([itemId, need]) => {
        const have = haveMap.get(itemId) ?? 0
        const deficit = Math.max(0, need - have)
        return { itemId, need, have, deficit, item: getItem(game, itemId) }
      })
      .sort((a, b) => {
        if (a.deficit !== b.deficit) return b.deficit - a.deficit
        return (a.item?.name ?? a.itemId).localeCompare(b.item?.name ?? b.itemId)
      })
  }, [needs, haveMap, game])

  const filterLabel =
    filter === null
      ? null
      : filter === 'unassigned'
        ? 'Unassigned'
        : projects.find((p) => p.id === filter)?.name ?? '(unknown project)'

  async function markGathered(itemId: string, need: number) {
    if (isRealProjectFilter(filter)) {
      // Project mode: set the project's allocation to `need`, and bump global inventory
      // only if the new total of allocations across projects exceeds it.
      const projectId = filter
      await db.transaction('rw', db.inventory, db.allocations, async () => {
        await db.allocations.put({
          id: allocationId(projectId, itemId),
          projectId,
          itemId,
          count: need,
        })
        const allAllocs = await db.allocations.where('itemId').equals(itemId).toArray()
        const totalAllocated = allAllocs.reduce((s, a) => s + a.count, 0)
        const current = await db.inventory.get(itemId)
        const currentGlobal = current?.count ?? 0
        if (currentGlobal < totalAllocated) {
          await db.inventory.put({ itemId, count: totalAllocated })
        }
      })
    } else {
      // Global / Unassigned mode: bump global inventory to cover the need.
      const current = globalInventory.get(itemId) ?? 0
      if (current < need) await db.inventory.put({ itemId, count: need })
    }
  }

  if (queueRows.length === 0) {
    return (
      <p className="text-sm text-slate-500 py-8 text-center border border-dashed border-slate-800 rounded-md">
        {filter === null
          ? 'Queue is empty — add items on the Queue tab.'
          : `No queued items for ${filterLabel}.`}
      </p>
    )
  }

  const totalDeficit = rows.reduce((sum, r) => sum + r.deficit, 0)
  const gatheredCount = rows.filter((r) => r.deficit === 0).length
  const haveLabel = isRealProjectFilter(filter) ? 'allocated' : 'have'

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-slate-400">
          Raw materials for {queueRows.length} queued item{queueRows.length === 1 ? '' : 's'}
          {filterLabel && <span className="text-slate-500"> · {filterLabel}</span>}
        </p>
        <p className="text-xs text-slate-500 tabular-nums">
          {gatheredCount}/{rows.length} gathered
          {totalDeficit > 0 && <span className="text-amber-400 ml-2">{totalDeficit} short</span>}
        </p>
      </div>
      {isRealProjectFilter(filter) && (
        <p className="text-xs text-slate-500">
          Showing this project's allocation as "have". Mark gathered raises both allocation and (if needed) global inventory.
        </p>
      )}
      <ul className="border border-slate-800 rounded-md divide-y divide-slate-800">
        {rows.map((row) => {
          const location = locationString(row.item)
          return (
            <li key={row.itemId} className="flex items-start gap-3 px-3 py-2">
              <input
                type="checkbox"
                checked={row.deficit === 0}
                onChange={() => row.deficit > 0 && markGathered(row.itemId, row.need)}
                className="accent-sky-500 w-4 h-4 mt-1"
                aria-label="Mark gathered"
              />
              <div className="flex-1 min-w-0">
                <div className={`text-sm ${row.deficit === 0 ? 'text-slate-400' : ''}`}>
                  {row.item?.name ?? row.itemId}
                </div>
                {location && (
                  <div className="text-xs text-slate-500 truncate" title={location}>
                    {location}
                  </div>
                )}
                {row.item?.notes && (
                  <div className="text-xs text-slate-600 italic mt-0.5">{row.item.notes}</div>
                )}
              </div>
              <span className="text-xs text-slate-500 w-16 text-right tabular-nums mt-0.5">need {row.need}</span>
              <span className="text-xs text-slate-500 w-20 text-right tabular-nums mt-0.5">
                {haveLabel} {row.have}
              </span>
              <span
                className={`text-sm w-16 text-right tabular-nums font-medium mt-0.5 ${
                  row.deficit > 0 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {row.deficit > 0 ? `−${row.deficit}` : '✓'}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
