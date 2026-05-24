import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { allocationId, db } from '../db/schema'
import { getActiveGame } from '../games'
import { locationString } from '../lib/location'
import { rollupQueue } from '../lib/rollup'
import { isRealProjectFilter, useProjectFilter } from '../lib/projectFilter'
import type { ItemCategory } from '../games/types'

const FILTERS: Array<{ id: 'all' | ItemCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'raw', label: 'Raw' },
  { id: 'component', label: 'Components' },
  { id: 'tool', label: 'Tools' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'upgrade', label: 'Upgrades' },
  { id: 'vehicle', label: 'Vehicles' },
  { id: 'base', label: 'Base' },
  { id: 'consumable', label: 'Consumables' },
]

export default function Inventory() {
  const game = getActiveGame()
  const { filter: projectFilter } = useProjectFilter()
  const inventoryRows = useLiveQuery(() => db.inventory.toArray()) ?? []
  const allAllocations = useLiveQuery(() => db.allocations.toArray()) ?? []
  const projects = useLiveQuery(() => db.projects.toArray()) ?? []
  const allActiveQueue =
    useLiveQuery(() => db.queue.where('completed').equals(0).toArray()) ?? []

  const globalCounts = useMemo(
    () => new Map(inventoryRows.map((r) => [r.itemId, r.count])),
    [inventoryRows],
  )

  const inProject = isRealProjectFilter(projectFilter)
  const projectId = inProject ? projectFilter : null
  const projectName = inProject ? projects.find((p) => p.id === projectId)?.name : null

  const thisProjectAllocations = useMemo(() => {
    if (!projectId) return new Map<string, number>()
    return new Map(
      allAllocations.filter((a) => a.projectId === projectId).map((a) => [a.itemId, a.count]),
    )
  }, [allAllocations, projectId])

  const totalAllocatedByItem = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of allAllocations) m.set(a.itemId, (m.get(a.itemId) ?? 0) + a.count)
    return m
  }, [allAllocations])

  // Queue rollup of raw-material needs, respecting project filter + per-entry progress.
  // Matches what the Gathering tab computes so the two views agree.
  const visibleQueue = useMemo(() => {
    if (projectFilter === null) return allActiveQueue
    if (projectFilter === 'unassigned') return allActiveQueue.filter((r) => !r.projectId)
    return allActiveQueue.filter((r) => r.projectId === projectFilter)
  }, [allActiveQueue, projectFilter])

  const needs = useMemo(
    () =>
      rollupQueue(
        game,
        visibleQueue.map((r) => ({ itemId: r.itemId, qty: r.qty, progress: r.progress })),
      ),
    [game, visibleQueue],
  )

  const [category, setCategory] = useState<'all' | ItemCategory>('raw')
  const [search, setSearch] = useState('')
  const [onlyNeeded, setOnlyNeeded] = useState(false)

  const items = useMemo(() => {
    const needle = search.toLowerCase()
    return game.items.filter((item) => {
      if (category !== 'all' && item.category !== category) return false
      if (needle && !item.name.toLowerCase().includes(needle)) return false
      if (onlyNeeded) {
        const need = needs.get(item.id) ?? 0
        if (need === 0) return false
        const have = inProject
          ? thisProjectAllocations.get(item.id) ?? 0
          : globalCounts.get(item.id) ?? 0
        if (have >= need) return false
      }
      return true
    })
  }, [game, category, search, onlyNeeded, needs, inProject, thisProjectAllocations, globalCounts])

  async function bumpGlobal(itemId: string, delta: number) {
    const current = globalCounts.get(itemId) ?? 0
    await setGlobalExact(itemId, current + delta)
  }

  async function setGlobalExact(itemId: string, value: number) {
    const next = Math.max(0, Math.floor(value))
    if (next === 0) await db.inventory.delete(itemId)
    else await db.inventory.put({ itemId, count: next })
  }

  async function bumpAllocation(itemId: string, delta: number) {
    const current = thisProjectAllocations.get(itemId) ?? 0
    await setAllocationExact(itemId, current + delta)
  }

  async function setAllocationExact(itemId: string, value: number) {
    if (!projectId) return
    const next = Math.max(0, Math.floor(value))
    const id = allocationId(projectId, itemId)
    // Mirror Gathering's mark-gathered: bump global up if the new total of
    // allocations across all projects exceeds it. Never decrease global here.
    await db.transaction('rw', db.inventory, db.allocations, async () => {
      if (next === 0) {
        await db.allocations.delete(id)
      } else {
        await db.allocations.put({ id, projectId, itemId, count: next })
      }
      const allAllocs = await db.allocations.where('itemId').equals(itemId).toArray()
      const totalAllocated = allAllocs.reduce((s, a) => s + a.count, 0)
      const current = await db.inventory.get(itemId)
      const currentGlobal = current?.count ?? 0
      if (currentGlobal < totalAllocated) {
        await db.inventory.put({ itemId, count: totalAllocated })
      }
    })
  }

  return (
    <div className="space-y-4">
      {inProject && (
        <div className="border border-sky-900 bg-sky-950/30 rounded-md px-3 py-2 text-sm text-sky-200">
          Allocating to <strong>{projectName ?? '(unknown)'}</strong>. Adjusting Allocated claims material for this project; global Total auto-bumps to match if you allocate beyond what's currently in inventory.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                category === c.id
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOnlyNeeded((v) => !v)}
          className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
            onlyNeeded
              ? 'bg-amber-600 text-white'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
          title="Show only items the queue is short on"
        >
          Only needed
        </button>
        <input
          type="search"
          placeholder="Filter…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm w-40 focus:outline-none focus:border-sky-500"
        />
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center border border-dashed border-slate-800 rounded-md">
          {onlyNeeded ? 'Nothing needed in this view.' : 'No items match.'}
        </p>
      ) : (
        <ul className="border border-slate-800 rounded-md divide-y divide-slate-800">
          {items.map((item) => {
            const total = globalCounts.get(item.id) ?? 0
            const location = locationString(item)
            const need = needs.get(item.id) ?? 0
            const have = inProject ? thisProjectAllocations.get(item.id) ?? 0 : total
            const deficit = need > 0 ? Math.max(0, need - have) : 0
            const showDeficit = need > 0

            const deficitText = showDeficit
              ? deficit > 0
                ? `short ${deficit}`
                : '✓'
              : ''
            const deficitClass = showDeficit
              ? deficit > 0
                ? 'text-amber-400'
                : 'text-emerald-400'
              : 'text-transparent'

            if (inProject) {
              const allocated = have
              const totalAllocated = totalAllocatedByItem.get(item.id) ?? 0
              const overAllocated = totalAllocated > total
              return (
                <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{item.name}</div>
                    {location && (
                      <div className="text-xs text-slate-500 truncate" title={location}>
                        {location}
                      </div>
                    )}
                  </div>
                  <span
                    className="w-16 text-right text-xs text-slate-500 tabular-nums"
                    title="Amount your project's queue requires"
                  >
                    {showDeficit ? `need ${need}` : ''}
                  </span>
                  <span
                    className={`w-16 text-right text-xs tabular-nums font-medium ${deficitClass}`}
                    title="Project need minus this project's allocation"
                  >
                    {deficitText}
                  </span>
                  <div
                    className="flex items-center gap-1"
                    title="Material claimed for this project"
                  >
                    <span className="text-xs text-slate-500">alloc</span>
                    <button
                      onClick={() => bumpAllocation(item.id, -1)}
                      className="w-7 h-7 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-base leading-none"
                      aria-label="Decrease allocation"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={allocated}
                      onChange={(e) => setAllocationExact(item.id, parseInt(e.target.value) || 0)}
                      className="w-14 text-center bg-slate-900 border border-slate-700 rounded-md py-1 text-sm tabular-nums focus:outline-none focus:border-sky-500"
                    />
                    <button
                      onClick={() => bumpAllocation(item.id, 1)}
                      className="w-7 h-7 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-base leading-none"
                      aria-label="Increase allocation"
                    >
                      +
                    </button>
                  </div>
                  <span
                    className={`w-24 text-right text-xs tabular-nums ${overAllocated ? 'text-amber-400 font-medium' : 'text-slate-500'}`}
                    title={
                      overAllocated
                        ? `Over-allocated: ${totalAllocated} claimed across projects but only ${total} in your inventory. Gather more or reduce allocations.`
                        : 'Global inventory total (shared across projects)'
                    }
                  >
                    stock {total}
                    {overAllocated ? ' ⚠' : ''}
                  </span>
                </li>
              )
            }
            return (
              <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm">{item.name}</div>
                  {location && (
                    <div className="text-xs text-slate-500 truncate" title={location}>
                      {location}
                    </div>
                  )}
                </div>
                <span
                  className="w-16 text-right text-xs text-slate-500 tabular-nums"
                  title="Amount your queue requires"
                >
                  {showDeficit ? `need ${need}` : ''}
                </span>
                <span
                  className={`w-16 text-right text-xs tabular-nums font-medium ${deficitClass}`}
                  title="Queue need minus what you have"
                >
                  {deficitText}
                </span>
                <div className="flex items-center gap-1" title="Global inventory total">
                  <span className="text-xs text-slate-500">have</span>
                  <button
                    onClick={() => bumpGlobal(item.id, -1)}
                    className="w-7 h-7 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-base leading-none"
                    aria-label="Decrease"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    value={total}
                    onChange={(e) => setGlobalExact(item.id, parseInt(e.target.value) || 0)}
                    className="w-14 text-center bg-slate-900 border border-slate-700 rounded-md py-1 text-sm tabular-nums focus:outline-none focus:border-sky-500"
                  />
                  <button
                    onClick={() => bumpGlobal(item.id, 1)}
                    className="w-7 h-7 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-base leading-none"
                    aria-label="Increase"
                  >
                    +
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
