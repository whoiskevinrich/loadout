import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { allocationId, db, type AllocationRow } from '../db/schema'
import { getActiveGame, getItem, getRecipe } from '../games'
import { rollupQueue, collectComponents } from '../lib/rollup'
import { locationString } from '../lib/location'
import { isRealProjectFilter, useProjectFilter } from '../lib/projectFilter'

export default function Gathering() {
  const game = getActiveGame()
  const { filter } = useProjectFilter()
  const [showComponents, setShowComponents] = useState(false)

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

  const componentItems = useMemo(
    () =>
      collectComponents(
        game,
        queueRows.map((r) => ({ itemId: r.itemId, qty: r.qty })),
      ),
    [game, queueRows],
  )

  const componentDetails = useMemo(() => {
    return componentItems.map((comp) => {
      const item = getItem(game, comp.itemId)
      const recipe = getRecipe(game, comp.itemId)
      if (!recipe) return { comp, item, recipe: null, ready: false, inputs: [], batches: 0 }

      const batches = Math.ceil(comp.qty / recipe.outputQty)
      let ready = true

      const inputs = recipe.inputs.map((input) => {
        const inputItem = getItem(game, input.itemId)
        const totalNeed = input.qty * batches
        const isComp = !!getRecipe(game, input.itemId)
        // Only check raw inputs against haveMap; component inputs are handled by deeper tiers
        const have = isComp ? null : (haveMap.get(input.itemId) ?? 0)
        if (!isComp && (have ?? 0) < totalNeed) ready = false
        return { itemId: input.itemId, inputItem, totalNeed, isComp, have }
      })

      return { comp, item, recipe, ready, inputs, batches }
    })
  }, [componentItems, haveMap, game])

  const readyComponentCount = componentDetails.filter((d) => d.ready).length

  // A component is "crafted" when every filtered queue row has progress[id] = true.
  const craftedComponents = useMemo(() => {
    const ids = componentDetails.map((d) => d.comp.itemId)
    return new Set(
      ids.filter((id) => queueRows.length > 0 && queueRows.every((r) => !!r.progress?.[id])),
    )
  }, [queueRows, componentDetails])

  const filterLabel =
    filter === null
      ? null
      : filter === 'unassigned'
        ? 'Unassigned'
        : (projects.find((p) => p.id === filter)?.name ?? '(unknown project)')

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

  async function markUngathered(itemId: string) {
    if (isRealProjectFilter(filter)) {
      // Project mode: zero out this project's allocation, then pull global inventory
      // back down to the new sum of remaining allocations (if it was bumped for us).
      const projectId = filter
      await db.transaction('rw', db.inventory, db.allocations, async () => {
        await db.allocations.put({
          id: allocationId(projectId, itemId),
          projectId,
          itemId,
          count: 0,
        })
        const allAllocs = await db.allocations.where('itemId').equals(itemId).toArray()
        const totalAllocated = allAllocs.reduce((s, a) => s + a.count, 0)
        const current = await db.inventory.get(itemId)
        const currentGlobal = current?.count ?? 0
        if (currentGlobal > totalAllocated) {
          await db.inventory.put({ itemId, count: totalAllocated })
        }
      })
    } else {
      // Global / Unassigned mode: zero out inventory for this item.
      await db.inventory.put({ itemId, count: 0 })
    }
  }

  async function toggleCraftedComponent(componentId: string) {
    const nowCrafted = !craftedComponents.has(componentId)
    await db.transaction('rw', db.queue, async () => {
      for (const row of queueRows) {
        const progress = { ...(row.progress ?? {}) }
        if (nowCrafted) progress[componentId] = true
        else delete progress[componentId]
        await db.queue.update(row.id, { progress })
      }
    })
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
          Showing this project's allocation as "have". Mark gathered raises both allocation and (if
          needed) global inventory.
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
                onChange={() =>
                  row.deficit > 0 ? markGathered(row.itemId, row.need) : markUngathered(row.itemId)
                }
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
              <span className="text-xs text-slate-500 w-16 text-right tabular-nums mt-0.5">
                need {row.need}
              </span>
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

      {componentDetails.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowComponents((v) => !v)}
            className="w-full flex items-center justify-between text-sm text-slate-400 hover:text-slate-300 transition-colors py-0.5"
          >
            <span className="flex items-center gap-2">
              <span
                className="text-slate-600 text-xs inline-block transition-transform duration-150"
                style={{ transform: showComponents ? 'rotate(90deg)' : 'rotate(0deg)' }}
              >
                ▶
              </span>
              Crafting steps
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              {craftedComponents.size}/{componentDetails.length} crafted
            </span>
          </button>

          {showComponents && (
            <ul className="border border-slate-800 rounded-md divide-y divide-slate-800">
              {componentDetails.map(({ comp, item, recipe, ready, inputs }) => {
                const crafted = craftedComponents.has(comp.itemId)
                return (
                  <li
                    key={comp.itemId}
                    className={`px-3 py-2 space-y-1 ${crafted ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={crafted}
                        onChange={() => toggleCraftedComponent(comp.itemId)}
                        className="accent-sky-500 w-3.5 h-3.5 flex-shrink-0"
                        aria-label={`Mark ${item?.name ?? comp.itemId} crafted`}
                      />
                      {!crafted && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            ready ? 'bg-emerald-400' : 'bg-amber-400'
                          }`}
                        />
                      )}
                      <span
                        className={`text-sm flex-1 ${crafted ? 'line-through text-slate-500' : ready ? 'text-slate-400' : ''}`}
                      >
                        {item?.name ?? comp.itemId}
                      </span>
                      <span className="text-xs text-slate-600 tabular-nums">×{comp.qty}</span>
                      {item?.craftedAt && (
                        <span className="text-xs text-slate-700 bg-slate-800 px-1.5 py-0.5 rounded">
                          {item.craftedAt}
                        </span>
                      )}
                    </div>
                    {recipe && !crafted && (
                      <div className="pl-9 flex flex-wrap gap-x-4 gap-y-0.5">
                        {inputs.map((inp) => (
                          <span key={inp.itemId} className="text-xs">
                            <span className="text-slate-600 tabular-nums">{inp.totalNeed}×</span>{' '}
                            {inp.isComp ? (
                              <span className="text-slate-500 italic">
                                {inp.inputItem?.name ?? inp.itemId}
                              </span>
                            ) : (
                              <span
                                className={
                                  inp.have !== null && inp.have < inp.totalNeed
                                    ? 'text-amber-400/80'
                                    : 'text-slate-500'
                                }
                              >
                                {inp.inputItem?.name ?? inp.itemId}
                                {inp.have !== null && inp.have < inp.totalNeed && (
                                  <span className="text-slate-600 ml-1">(have {inp.have})</span>
                                )}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
