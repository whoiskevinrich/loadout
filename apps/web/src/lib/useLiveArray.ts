import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'

const EMPTY: readonly unknown[] = []

/**
 * Wrapper around `useLiveQuery` that returns a stable empty array while the
 * query is undefined (initial load). Using `useLiveQuery(...) ?? []` creates a
 * fresh `[]` each render, breaking referential equality for any downstream
 * `useMemo`/`useEffect` dependency that lists it — and trips
 * `react-hooks/exhaustive-deps`.
 */
export function useLiveArray<T>(querier: () => Promise<T[]> | T[], deps?: unknown[]): T[] {
  const result = useLiveQuery<T[] | undefined>(querier, deps)
  return useMemo(() => result ?? (EMPTY as T[]), [result])
}
