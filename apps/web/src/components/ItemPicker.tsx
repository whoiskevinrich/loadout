import { useEffect, useMemo, useRef, useState } from 'react'
import type { Item } from '../games/types'

interface ItemPickerProps {
  items: Item[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  className?: string
}

const MAX_RESULTS = 50

export function ItemPicker({ items, value, onChange, placeholder, className }: ItemPickerProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selected = items.find((i) => i.id === value)
  const displayValue = open ? query : selected?.name ?? ''

  const filtered = useMemo(() => {
    if (!open) return []
    const q = query.trim().toLowerCase()
    const result = q
      ? items.filter((i) => i.name.toLowerCase().includes(q))
      : items.slice()
    return result.slice(0, MAX_RESULTS)
  }, [items, query, open])

  useEffect(() => {
    setHighlightIdx(0)
  }, [query, open])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Keep the highlighted option scrolled into view
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[highlightIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx, open])

  function select(item: Item) {
    onChange(item.id)
    setOpen(false)
    setQuery('')
  }

  function onFocus() {
    setOpen(true)
    setQuery('')
    // Show all items immediately
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlightIdx((idx) => Math.min(Math.max(0, filtered.length - 1), idx + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((idx) => Math.max(0, idx - 1))
    } else if (e.key === 'Enter') {
      if (open && filtered[highlightIdx]) {
        e.preventDefault()
        select(filtered[highlightIdx]!)
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        setOpen(false)
        setQuery('')
      }
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
        className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-sky-500"
      />
      {open && (
        <>
          {filtered.length > 0 ? (
            <ul
              ref={listRef}
              className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-700 bg-slate-900 shadow-lg"
            >
              {filtered.map((item, idx) => (
                <li
                  key={item.id}
                  className={`px-3 py-1.5 text-sm cursor-pointer flex items-center justify-between ${
                    idx === highlightIdx ? 'bg-sky-600 text-white' : 'hover:bg-slate-800'
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    select(item)
                  }}
                  onMouseEnter={() => setHighlightIdx(idx)}
                >
                  <span>{item.name}</span>
                  <span
                    className={`ml-2 text-xs ${idx === highlightIdx ? 'text-sky-100' : 'text-slate-500'}`}
                  >
                    {item.category}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="absolute z-30 mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-500">
              No matches
            </div>
          )}
        </>
      )}
    </div>
  )
}
