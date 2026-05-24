import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { useProjectFilter } from '../lib/projectFilter'

export function ProjectSelector() {
  const projects = useLiveQuery(
    () => db.projects.where('archived').equals(0).sortBy('position'),
  ) ?? []
  const { filter, setFilter } = useProjectFilter()

  const value = filter ?? '__all__'

  return (
    <select
      value={value}
      onChange={(e) => {
        const v = e.target.value
        setFilter(v === '__all__' ? null : v)
      }}
      className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-sm focus:outline-none focus:border-sky-500 max-w-[180px]"
      title="Filter by project"
    >
      <option value="__all__">All projects</option>
      <option value="unassigned">Unassigned</option>
      {projects.length > 0 && (
        <option disabled>──────────</option>
      )}
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  )
}
