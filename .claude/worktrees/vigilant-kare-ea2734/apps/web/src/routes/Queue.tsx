import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type AllocationRow, type ProjectRow, type QueueRow } from '../db/schema'
import { craftableItems, getActiveGame, getItem, getRecipe } from '../games'
import type { Game } from '../games/types'
import { buildTree, type BuildNode } from '../lib/rollup'
import { newId } from '../lib/ids'
import { isRealProjectFilter, useProjectFilter } from '../lib/projectFilter'
import { ItemPicker } from '../components/ItemPicker'

type DropTarget =
  | { kind: 'row'; id: string; position: 'before' | 'after' }
  | { kind: 'group'; groupKey: string }

interface QueueGroup {
  key: string                       // projectId or 'unassigned'
  name: string
  rows: QueueRow[]
  projectId: string | null          // null for unassigned
}

const COLLAPSED_KEY = 'loadout:collapsedGroups'

export default function Queue() {
  const game = getActiveGame()
  const { filter } = useProjectFilter()
  const allQueue = useLiveQuery(() => db.queue.orderBy('position').toArray()) ?? []
  const inventoryRows = useLiveQuery(() => db.inventory.toArray()) ?? []
  const projects = useLiveQuery(
    () => db.projects.where('archived').equals(0).sortBy('position'),
  ) ?? []
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
  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects])

  const filteredRows = useMemo(() => {
    if (filter === null) return allQueue
    if (filter === 'unassigned') return allQueue.filter((r) => !r.projectId)
    return allQueue.filter((r) => r.projectId === filter)
  }, [allQueue, filter])

  // Group rows for All Projects view; flat otherwise.
  const groups: QueueGroup[] = useMemo(() => {
    if (filter !== null) {
      const key = filter === 'unassigned' ? 'unassigned' : filter
      const name =
        filter === 'unassigned' ? 'Unassigned' : projectName.get(filter) ?? '(unknown project)'
      return [{ key, name, rows: filteredRows, projectId: filter === 'unassigned' ? null : filter }]
    }
    const list: QueueGroup[] = []
    const projectIds = new Set(projects.map((p) => p.id))
    for (const p of projects) {
      list.push({
        key: p.id,
        name: p.name,
        rows: allQueue.filter((r) => r.projectId === p.id),
        projectId: p.id,
      })
    }
    const unassignedRows = allQueue.filter((r) => !r.projectId || !projectIds.has(r.projectId))
    list.push({ key: 'unassigned', name: 'Unassigned', rows: unassignedRows, projectId: null })
    return list
  }, [filter, projects, allQueue, filteredRows, projectName])

  // Per-row expand state
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Group collapse state, persisted in localStorage
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_KEY)
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsedGroups]))
    } catch {
      // ignore
    }
  }, [collapsedGroups])

  function toggleGroupCollapse(key: string) {
    setCollapsedGroups((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Add-to-queue form state
  const [selectedId, setSelectedId] = useState('')
  const [qty, setQty] = useState(1)
  const [pickerProjectId, setPickerProjectId] = useState<string>('')
  const qtyInputRef = useRef<HTMLInputElement>(null)

  // Sync picker default when filter changes (but don't reset between adds)
  useEffect(() => {
    if (isRealProjectFilter(filter)) setPickerProjectId(filter)
    // In All / Unassigned mode, leave picker alone — user's choice persists
  }, [filter])

  // Mousewheel adjusts qty (native listener so we can preventDefault — React's wheel is passive)
  useEffect(() => {
    const el = qtyInputRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setQty((q) => Math.max(1, q + (e.deltaY < 0 ? 1 : -1)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // DnD state
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)

  const options = craftableItems(game).sort((a, b) => a.name.localeCompare(b.name))
  const activeCount = filteredRows.filter((r) => !r.completed).length

  async function addToQueue() {
    if (!selectedId || qty < 1) return
    const maxPos = allQueue.reduce((m, r) => Math.max(m, r.position), -1)
    await db.queue.add({
      id: newId(),
      itemId: selectedId,
      qty,
      addedAt: Date.now(),
      completed: 0,
      position: maxPos + 1,
      progress: {},
      projectId: pickerProjectId || undefined,
    })
    setSelectedId('')
    setQty(1)
    // pickerProjectId intentionally preserved across entries
  }

  async function toggleComplete(row: QueueRow) {
    await db.queue.update(row.id, { completed: row.completed ? 0 : 1 })
  }

  async function removeRow(id: string) {
    await db.queue.delete(id)
    setExpanded((s) => {
      const next = new Set(s)
      next.delete(id)
      return next
    })
  }

  async function moveRowInGroup(rowId: string, direction: -1 | 1, scope: QueueRow[]) {
    const idx = scope.findIndex((r) => r.id === rowId)
    if (idx === -1) return
    const swapIdx = idx + direction
    if (swapIdx < 0 || swapIdx >= scope.length) return
    const a = scope[idx]!
    const b = scope[swapIdx]!
    await db.transaction('rw', db.queue, async () => {
      await db.queue.update(a.id, { position: b.position })
      await db.queue.update(b.id, { position: a.position })
    })
  }

  async function assignProject(rowId: string, projectId: string | undefined) {
    await db.queue.update(rowId, { projectId })
  }

  async function toggleProgress(rowId: string, itemId: string) {
    const row = await db.queue.get(rowId)
    if (!row) return
    const progress = { ...(row.progress ?? {}) }
    if (progress[itemId]) delete progress[itemId]
    else progress[itemId] = true
    await db.queue.update(rowId, { progress })
  }

  function toggleExpand(id: string) {
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function moveProject(projectId: string, direction: -1 | 1) {
    const idx = projects.findIndex((p) => p.id === projectId)
    if (idx === -1) return
    const swapIdx = idx + direction
    if (swapIdx < 0 || swapIdx >= projects.length) return
    const a = projects[idx]!
    const b = projects[swapIdx]!
    await db.transaction('rw', db.projects, async () => {
      await db.projects.update(a.id, { position: b.position })
      await db.projects.update(b.id, { position: a.position })
    })
  }

  // --- Drag-and-drop -------------------------------------------------------

  function onRowDragStart(e: React.DragEvent<HTMLLIElement>, id: string) {
    setDragging(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }

  function onRowDragOver(e: React.DragEvent<HTMLLIElement>, row: QueueRow) {
    if (!dragging || dragging === row.id) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const before = e.clientY < rect.top + rect.height / 2
    setDropTarget({ kind: 'row', id: row.id, position: before ? 'before' : 'after' })
  }

  function onGroupDragOver(e: React.DragEvent<HTMLElement>, groupKey: string) {
    if (!dragging) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget({ kind: 'group', groupKey })
  }

  function onDragEnd() {
    setDragging(null)
    setDropTarget(null)
  }

  async function commitDrop() {
    if (!dragging || !dropTarget) return
    const srcId = dragging
    const src = allQueue.find((r) => r.id === srcId)
    if (!src) return

    if (dropTarget.kind === 'row') {
      const target = allQueue.find((r) => r.id === dropTarget.id)
      if (!target || target.id === srcId) return

      // Compute group rows excluding the source so neighbor math is clean
      const groupRows = allQueue
        .filter(
          (r) =>
            r.id !== srcId &&
            (target.projectId === r.projectId ||
              (!target.projectId && !r.projectId)),
        )
        .sort((a, b) => a.position - b.position)
      const targetIdx = groupRows.findIndex((r) => r.id === target.id)
      if (targetIdx === -1) return

      let newPos: number
      if (dropTarget.position === 'before') {
        const above = groupRows[targetIdx - 1]
        newPos = above ? (above.position + target.position) / 2 : target.position - 1
      } else {
        const below = groupRows[targetIdx + 1]
        newPos = below ? (target.position + below.position) / 2 : target.position + 1
      }

      await db.queue.update(srcId, {
        position: newPos,
        projectId: target.projectId ?? undefined,
      })
    } else {
      // Drop on a group header / empty group → top of that group
      const targetProjectId =
        dropTarget.groupKey === 'unassigned' ? undefined : dropTarget.groupKey
      const groupRows = allQueue
        .filter((r) => r.id !== srcId && (r.projectId ?? null) === (targetProjectId ?? null))
        .sort((a, b) => a.position - b.position)
      const firstRow = groupRows[0]
      const newPos = firstRow ? firstRow.position - 1 : Date.now()
      await db.queue.update(srcId, { position: newPos, projectId: targetProjectId })
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    void commitDrop().finally(() => {
      setDragging(null)
      setDropTarget(null)
    })
  }

  // -------------------------------------------------------------------------

  const filterLabel =
    filter === null
      ? null
      : filter === 'unassigned'
        ? 'Unassigned'
        : projectName.get(filter) ?? '(unknown project)'

  const showGroupHeaders = filter === null
  const totalVisible = groups.reduce((s, g) => s + g.rows.length, 0)

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-2">
          Add to queue
          {filterLabel && <span className="ml-2 text-slate-400 normal-case"> · → {filterLabel}</span>}
        </h2>
        <div className="flex gap-2 flex-wrap">
          <ItemPicker
            items={options}
            value={selectedId}
            onChange={setSelectedId}
            placeholder="Type to search items…"
            className="flex-1 min-w-[220px]"
          />
          <input
            ref={qtyInputRef}
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-20 bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-center tabular-nums focus:outline-none focus:border-sky-500"
            title="Scroll to adjust"
          />
          <select
            value={pickerProjectId}
            onChange={(e) => setPickerProjectId(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-sky-500 max-w-[180px]"
            title="Project assignment"
          >
            <option value="">(no project)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            onClick={addToQueue}
            disabled={!selectedId}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed rounded-md text-sm font-medium transition-colors"
          >
            Add
          </button>
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-xs uppercase tracking-wider text-slate-500">
            Queue
            {filterLabel && <span className="text-slate-400 normal-case ml-1"> — {filterLabel}</span>}
            {activeCount > 0 && (
              <span className="text-slate-400 normal-case ml-1"> · {activeCount} active</span>
            )}
          </h2>
        </div>

        {totalVisible === 0 && !dragging ? (
          <p className="text-sm text-slate-500 py-8 text-center border border-dashed border-slate-800 rounded-md">
            {filter === null
              ? 'Nothing queued yet.'
              : `No queued items for ${filterLabel}.`}
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map((group, gIdx) => (
              <QueueGroupSection
                key={group.key}
                group={group}
                groupIdx={gIdx}
                totalGroups={groups.length}
                showHeader={showGroupHeaders}
                isCollapsed={collapsedGroups.has(group.key)}
                onToggleCollapse={() => toggleGroupCollapse(group.key)}
                onMoveProjectUp={
                  group.projectId
                    ? () => moveProject(group.projectId!, -1)
                    : undefined
                }
                onMoveProjectDown={
                  group.projectId
                    ? () => moveProject(group.projectId!, 1)
                    : undefined
                }
                canMoveProjectUp={!!group.projectId && projects.findIndex((p) => p.id === group.projectId) > 0}
                canMoveProjectDown={
                  !!group.projectId &&
                  projects.findIndex((p) => p.id === group.projectId) < projects.length - 1
                }
                dragging={dragging}
                dropTarget={dropTarget}
                onGroupDragOver={(e) => onGroupDragOver(e, group.key)}
                onDrop={onDrop}
              >
                {group.rows.length === 0 ? (
                  dragging ? (
                    <div
                      onDragOver={(e) => onGroupDragOver(e, group.key)}
                      onDrop={onDrop}
                      className={`border border-dashed rounded-md p-3 text-center text-xs ${
                        dropTarget?.kind === 'group' && dropTarget.groupKey === group.key
                          ? 'border-sky-500 text-sky-300'
                          : 'border-slate-800 text-slate-500'
                      }`}
                    >
                      Drop here to assign to {group.name}
                    </div>
                  ) : (
                    showGroupHeaders && (
                      <p className="text-xs text-slate-600 italic px-3 py-1">No items.</p>
                    )
                  )
                ) : (
                  <ul className="space-y-1">
                    {group.rows.map((row, idx) => (
                      <QueueRowItem
                        key={row.id}
                        row={row}
                        idx={idx}
                        scope={group.rows}
                        game={game}
                        haveMap={haveMap}
                        projects={projects}
                        projectName={projectName}
                        showProjectChip={showGroupHeaders === false && (filter === null || filter === 'unassigned')}
                        isOpen={expanded.has(row.id)}
                        onToggleExpand={() => toggleExpand(row.id)}
                        onToggleComplete={() => toggleComplete(row)}
                        onRemove={() => removeRow(row.id)}
                        onMoveUp={() => moveRowInGroup(row.id, -1, group.rows)}
                        onMoveDown={() => moveRowInGroup(row.id, 1, group.rows)}
                        canMoveUp={idx > 0}
                        canMoveDown={idx < group.rows.length - 1}
                        onAssignProject={(pid) => assignProject(row.id, pid)}
                        onToggleProgress={(id) => toggleProgress(row.id, id)}
                        dragging={dragging}
                        dropTarget={dropTarget}
                        onDragStart={(e) => onRowDragStart(e, row.id)}
                        onDragOver={(e) => onRowDragOver(e, row)}
                        onDragEnd={onDragEnd}
                        onDrop={onDrop}
                      />
                    ))}
                  </ul>
                )}
              </QueueGroupSection>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// --- Group section -------------------------------------------------------

interface QueueGroupSectionProps {
  group: QueueGroup
  groupIdx: number
  totalGroups: number
  showHeader: boolean
  isCollapsed: boolean
  onToggleCollapse: () => void
  onMoveProjectUp?: () => void
  onMoveProjectDown?: () => void
  canMoveProjectUp: boolean
  canMoveProjectDown: boolean
  dragging: string | null
  dropTarget: DropTarget | null
  onGroupDragOver: (e: React.DragEvent<HTMLElement>) => void
  onDrop: (e: React.DragEvent) => void
  children: React.ReactNode
}

function QueueGroupSection({
  group,
  showHeader,
  isCollapsed,
  onToggleCollapse,
  onMoveProjectUp,
  onMoveProjectDown,
  canMoveProjectUp,
  canMoveProjectDown,
  dragging,
  dropTarget,
  onGroupDragOver,
  onDrop,
  children,
}: QueueGroupSectionProps) {
  const activeCount = group.rows.filter((r) => !r.completed).length
  const totalCount = group.rows.length
  const isGroupDropTarget = dropTarget?.kind === 'group' && dropTarget.groupKey === group.key

  return (
    <div className="space-y-1">
      {showHeader && (
        <div
          onDragOver={dragging ? onGroupDragOver : undefined}
          onDrop={dragging ? onDrop : undefined}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
            isGroupDropTarget
              ? 'bg-sky-950/50 ring-1 ring-sky-500'
              : 'bg-slate-900/60'
          }`}
        >
          <button
            onClick={onToggleCollapse}
            className="text-slate-400 hover:text-slate-200 text-xs w-4 transition-transform"
            aria-label={isCollapsed ? 'Expand group' : 'Collapse group'}
          >
            <span className={`inline-block transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>▶</span>
          </button>
          <span
            className={`text-sm font-medium ${group.projectId ? 'text-slate-100' : 'text-slate-400 italic'}`}
          >
            {group.name}
          </span>
          <span className="text-xs text-slate-500 tabular-nums">
            {activeCount > 0 ? `${activeCount} active` : ''}
            {activeCount === 0 && totalCount > 0 && `${totalCount} done`}
            {totalCount === 0 && '—'}
          </span>
          {onMoveProjectUp && onMoveProjectDown && (
            <div className="ml-auto flex items-center gap-0.5">
              <button
                onClick={onMoveProjectUp}
                disabled={!canMoveProjectUp}
                className="w-6 h-6 rounded-md text-slate-500 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-xs"
                aria-label="Move project up"
                title="Move project up"
              >
                ↑
              </button>
              <button
                onClick={onMoveProjectDown}
                disabled={!canMoveProjectDown}
                className="w-6 h-6 rounded-md text-slate-500 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-xs"
                aria-label="Move project down"
                title="Move project down"
              >
                ↓
              </button>
            </div>
          )}
        </div>
      )}
      {!isCollapsed && children}
    </div>
  )
}

// --- Queue row -----------------------------------------------------------

interface QueueRowItemProps {
  row: QueueRow
  idx: number
  scope: QueueRow[]
  game: Game
  haveMap: Map<string, number>
  projects: ProjectRow[]
  projectName: Map<string, string>
  showProjectChip: boolean
  isOpen: boolean
  onToggleExpand: () => void
  onToggleComplete: () => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  onAssignProject: (pid: string | undefined) => void
  onToggleProgress: (itemId: string) => void
  dragging: string | null
  dropTarget: DropTarget | null
  onDragStart: (e: React.DragEvent<HTMLLIElement>) => void
  onDragOver: (e: React.DragEvent<HTMLLIElement>) => void
  onDragEnd: () => void
  onDrop: (e: React.DragEvent) => void
}

function QueueRowItem({
  row,
  game,
  haveMap,
  projects,
  projectName,
  showProjectChip,
  isOpen,
  onToggleExpand,
  onToggleComplete,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onAssignProject,
  onToggleProgress,
  dragging,
  dropTarget,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: QueueRowItemProps) {
  const item = getItem(game, row.itemId)
  if (!item) return null

  const tree = isOpen ? buildTree(game, row.itemId, row.qty) : null
  const isBeingDragged = dragging === row.id
  const showLineBefore =
    dropTarget?.kind === 'row' && dropTarget.id === row.id && dropTarget.position === 'before'
  const showLineAfter =
    dropTarget?.kind === 'row' && dropTarget.id === row.id && dropTarget.position === 'after'

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      className={`relative border rounded-md overflow-hidden transition-colors ${
        row.completed ? 'opacity-50' : ''
      } ${
        isBeingDragged ? 'opacity-30 border-slate-700' : 'border-slate-800'
      }`}
    >
      {showLineBefore && (
        <div className="absolute -top-px left-0 right-0 h-0.5 bg-sky-500 z-10 pointer-events-none" />
      )}
      {showLineAfter && (
        <div className="absolute -bottom-px left-0 right-0 h-0.5 bg-sky-500 z-10 pointer-events-none" />
      )}
      <div className="flex items-center gap-2 px-2 py-2 flex-wrap">
        <span
          className="text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing select-none px-1 text-sm"
          title="Drag to reorder"
        >
          ⠿
        </span>
        <input
          type="checkbox"
          checked={!!row.completed}
          onChange={onToggleComplete}
          className="accent-sky-500 w-4 h-4"
          aria-label="Mark entry complete"
        />
        <button
          onClick={onToggleExpand}
          className="flex-1 min-w-0 text-left flex items-center gap-2 hover:text-sky-400 transition-colors"
        >
          <span
            className={`text-slate-500 text-xs transition-transform inline-block w-3 ${isOpen ? 'rotate-90' : ''}`}
          >
            ▶
          </span>
          <span className={row.completed ? 'line-through' : ''}>{item.name}</span>
          <span className="text-slate-500 text-sm tabular-nums">×{row.qty}</span>
        </button>
        {showProjectChip && (
          <select
            value={row.projectId ?? ''}
            onChange={(e) => onAssignProject(e.target.value || undefined)}
            className="bg-slate-900 border border-slate-700 hover:border-slate-600 rounded-md px-2 py-0.5 text-xs max-w-[140px] focus:outline-none focus:border-sky-500"
            title="Assign to project"
          >
            <option value="">(no project)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {row.projectId && !projectName.has(row.projectId) && (
              <option value={row.projectId} disabled>
                (unknown)
              </option>
            )}
          </select>
        )}
        <div className="flex items-center gap-0.5">
          <button
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="w-7 h-7 rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            aria-label="Move up"
            title="Move up"
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="w-7 h-7 rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            aria-label="Move down"
            title="Move down"
          >
            ↓
          </button>
        </div>
        <button
          onClick={onRemove}
          className="text-slate-500 hover:text-red-400 text-sm transition-colors ml-1"
        >
          Remove
        </button>
      </div>
      {isOpen && tree && (
        <div className="border-t border-slate-800 py-2 bg-slate-950/50">
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-1 px-3">
            Requirements
          </div>
          {tree.children.length === 0 ? (
            <p className="text-xs text-slate-500 px-3 py-1 italic">
              Raw material — gather directly.
            </p>
          ) : (
            <ul>
              {tree.children.map((child, i) => (
                <TreeNode
                  key={`${i}:${child.itemId}`}
                  node={child}
                  depth={0}
                  row={row}
                  inventory={haveMap}
                  game={game}
                  onToggle={onToggleProgress}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

// --- Recursive tree node -------------------------------------------------

interface TreeNodeProps {
  node: BuildNode
  depth: number
  row: QueueRow
  inventory: Map<string, number>
  game: Game
  onToggle: (itemId: string) => void
}

function TreeNode({ node, depth, row, inventory, game, onToggle }: TreeNodeProps) {
  const item = getItem(game, node.itemId)
  const checked = !!row.progress?.[node.itemId]
  const have = inventory.get(node.itemId) ?? 0
  const deficit = Math.max(0, node.qty - have)
  const recipe = node.isRaw ? null : getRecipe(game, node.itemId)
  const recipeHint = recipe
    ? recipe.inputs
        .map((i) => `${i.qty} ${getItem(game, i.itemId)?.name ?? i.itemId}`)
        .join(' + ')
    : null

  return (
    <>
      <li
        className="flex items-center gap-2 py-0.5 hover:bg-slate-900/50"
        style={{ paddingLeft: depth * 18 + 12, paddingRight: 12 }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(node.itemId)}
          className="accent-sky-500 w-3.5 h-3.5 flex-shrink-0"
          aria-label={`Mark ${item?.name ?? node.itemId} handled`}
        />
        <span
          className={`text-sm ${checked ? 'line-through text-slate-500' : node.isRaw ? 'text-slate-200' : 'text-sky-200'}`}
        >
          {item?.name ?? node.itemId}
        </span>
        <span className="text-slate-500 text-xs tabular-nums">×{node.qty}</span>
        {recipeHint && !checked && (
          <span
            className="text-xs text-slate-600 italic truncate"
            title={`Recipe: ${recipeHint} per ${item?.name ?? node.itemId}`}
          >
            · {recipeHint} each
          </span>
        )}
        {node.isRaw && !checked && (
          <span className="ml-auto flex items-center gap-3">
            <span className="text-xs text-slate-500 tabular-nums">have {have}</span>
            <span
              className={`text-xs tabular-nums w-10 text-right font-medium ${deficit > 0 ? 'text-amber-400' : 'text-emerald-400'}`}
            >
              {deficit > 0 ? `−${deficit}` : '✓'}
            </span>
          </span>
        )}
      </li>
      {!checked &&
        node.children.map((child, i) => (
          <TreeNode
            key={`${i}:${child.itemId}`}
            node={child}
            depth={depth + 1}
            row={row}
            inventory={inventory}
            game={game}
            onToggle={onToggle}
          />
        ))}
    </>
  )
}
