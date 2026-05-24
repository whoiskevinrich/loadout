import { NavLink, Outlet } from 'react-router-dom'
import { getActiveGame } from './games'
import { ProjectSelector } from './components/ProjectSelector'

const linkBase = 'px-3 py-1.5 rounded-md text-sm font-medium transition-colors'
const linkIdle = 'text-slate-300 hover:bg-slate-800 hover:text-white'
const linkActive = 'bg-slate-800 text-white'

export default function App() {
  const game = getActiveGame()
  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-semibold tracking-tight">Loadout</h1>
            <span className="text-xs text-slate-500">{game.name}</span>
          </div>
          <nav className="flex gap-1 ml-2">
            <NavLink to="/" end className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}>
              Queue
            </NavLink>
            <NavLink to="/gathering" className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}>
              Gathering
            </NavLink>
            <NavLink to="/inventory" className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}>
              Inventory
            </NavLink>
            <NavLink to="/projects" className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}>
              Projects
            </NavLink>
          </nav>
          <div className="ml-auto">
            <ProjectSelector />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
