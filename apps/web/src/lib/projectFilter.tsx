import { createContext, useContext, useState, type ReactNode } from 'react'

/**
 * The active project filter.
 *  - `null`        — All projects (no filter)
 *  - `'unassigned'` — Only queue entries without a project
 *  - any other string — A specific project id
 */
export type ProjectFilter = string | null

const STORAGE_KEY = 'loadout:projectFilter'

interface ContextValue {
  filter: ProjectFilter
  setFilter: (next: ProjectFilter) => void
}

const Ctx = createContext<ContextValue | null>(null)

export function ProjectFilterProvider({ children }: { children: ReactNode }) {
  const [filter, setFilterState] = useState<ProjectFilter>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored && stored !== 'null' ? stored : null
    } catch {
      return null
    }
  })

  function setFilter(next: ProjectFilter) {
    try {
      if (next === null) localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // localStorage unavailable (private mode) — fall back to in-memory only
    }
    setFilterState(next)
  }

  return <Ctx.Provider value={{ filter, setFilter }}>{children}</Ctx.Provider>
}

export function useProjectFilter(): ContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useProjectFilter must be used inside ProjectFilterProvider')
  return v
}

/** True when the filter is a specific project (not All, not Unassigned). */
export function isRealProjectFilter(filter: ProjectFilter): filter is string {
  return filter !== null && filter !== 'unassigned'
}
