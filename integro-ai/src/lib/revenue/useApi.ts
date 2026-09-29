import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'

// Fetches while `enabled` (views stay mounted, so this re-runs when a view becomes active).
export function useApi<T>(path: string | null, query: Record<string, string | number | undefined | null> = {}, enabled = true) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)
  const key = JSON.stringify(query)

  const load = useCallback(async () => {
    if (!path) return
    const my = ++seq.current
    setLoading(true)
    try {
      const d = await api<T>(path, { query: JSON.parse(key) })
      if (my === seq.current) { setData(d); setError(null) }
    } catch (e) {
      if (my === seq.current) setError(e instanceof ApiError ? e : new ApiError(0, 'error', 'Unexpected error'))
    } finally {
      if (my === seq.current) setLoading(false)
    }
  }, [path, key])

  useEffect(() => { if (enabled) void load() }, [enabled, load])
  return { data, error, loading, reload: load, setData }
}
