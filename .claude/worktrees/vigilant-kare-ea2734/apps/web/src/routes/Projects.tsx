import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type ProjectRow } from '../db/schema'
import { newId } from '../lib/ids'
import { useProjectFilter } from '../lib/projectFilter'

export default function Projects() {
  const projects = useLiveQuery(() => db.projects.orderBy('position').toArray()) ?? []
  const queueRows = useLiveQuery(() => db.queue.toArray()) ?? []
  const { filter, setFilter } = useProjectFilter()

  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  async function createProject() {
    const name = newName.trim()
    if (!name) return
    const maxPos = projects.reduce((m, p) => Math.max(m, p.position), -1)
    await db.projects.add({
      id: newId(),
      name,
      position: maxPos + 1,
      archived: 0,
      createdAt: Date.now(),
    })
    setNewName('')
  }

  function startRename(p: ProjectRow) {
    setRenamingId(p.id)
    setRenameValue(p.name)
  }

  async function commitRename() {
    if (!renamingId) return
    const name = renameValue.trim()
    if (name) await db.projects.update(renamingId, { name })
    setRenamingId(null)
    setRenameValue('')
  }

  async function deleteProject(id: string) {
    if (!confirm('Delete this project? Queue entries will be unassigned and allocations dropped.')) return
    await db.transaction('rw', db.projects, db.queue, db.allocations, async () => {
      await db.queue.where('projectId').equals(id).modify({ projectId: undefined })
      await db.allocations.where('projectId').equals(id).delete()
      await db.projects.delete(id)
    })
    if (filter === id) setFilter(null)
  }

  function entryCount(projectId: string): { active: number; total: number } {
    const rows = queueRows.filter((r) => r.projectId === projectId)
    return { active: rows.filter((r) => !r.completed).length, total: rows.length }
  }

  const unassignedCounts = (() => {
    const rows = queueRows.filter((r) => !r.projectId)
    return { active: rows.filter((r) => !r.completed).length, total: rows.length }
  })()

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Create project</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createProject()}
            placeholder="e.g. Cyclops Build, Base Expansion…"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-sky-500"
          />
          <button
            onClick={createProject}
            disabled={!newName.trim()}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed rounded-md text-sm font-medium transition-colors"
          >
            Add
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Projects</h2>
        <ul className="border border-slate-800 rounded-md divide-y divide-slate-800">
          <li className="flex items-center gap-3 px-3 py-2 bg-slate-900/30">
            <span className="text-sm text-slate-400 italic flex-1">Unassigned</span>
            <span className="text-xs text-slate-500 tabular-nums">
              {unassignedCounts.active} active · {unassignedCounts.total} total
            </span>
            <button
              onClick={() => setFilter('unassigned')}
              className="text-xs text-sky-400 hover:text-sky-300 ml-2"
            >
              View
            </button>
          </li>
          {projects.length === 0 ? (
            <li className="px-3 py-6 text-sm text-slate-500 text-center italic">
              No projects yet — create one above.
            </li>
          ) : (
            projects.map((p) => {
              const counts = entryCount(p.id)
              const isRenaming = renamingId === p.id
              return (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                  {isRenaming ? (
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') {
                          setRenamingId(null)
                          setRenameValue('')
                        }
                      }}
                      onBlur={commitRename}
                      autoFocus
                      className="flex-1 bg-slate-950 border border-sky-500 rounded-md px-2 py-1 text-sm focus:outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => startRename(p)}
                      className="flex-1 text-left text-sm hover:text-sky-400 transition-colors"
                      title="Click to rename"
                    >
                      {p.name}
                    </button>
                  )}
                  <span className="text-xs text-slate-500 tabular-nums">
                    {counts.active} active · {counts.total} total
                  </span>
                  <button
                    onClick={() => setFilter(p.id)}
                    className={`text-xs ml-2 ${filter === p.id ? 'text-sky-300 font-medium' : 'text-sky-400 hover:text-sky-300'}`}
                  >
                    {filter === p.id ? 'Active' : 'View'}
                  </button>
                  <button
                    onClick={() => deleteProject(p.id)}
                    className="text-xs text-slate-500 hover:text-red-400 ml-1"
                  >
                    Delete
                  </button>
                </li>
              )
            })
          )}
        </ul>
        {projects.length > 0 && (
          <p className="text-xs text-slate-500 mt-2">Click a project name to rename it.</p>
        )}
      </section>
    </div>
  )
}
