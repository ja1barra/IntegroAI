import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { api, ApiError } from './api'
import type { RevenueContext as Ctx } from './types'

interface State { loading: boolean; ctx: Ctx | null; error: ApiError | null; reload: () => void }
const C = createContext<State>({ loading: true, ctx: null, error: null, reload: () => {} })

export function RevenueProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<State, 'reload'>>({ loading: true, ctx: null, error: null })
  const load = useCallback(() => {
    setState(s => ({ ...s, loading: true }))
    api<Ctx>('revenue/context')
      .then(ctx => setState({ loading: false, ctx, error: null }))
      .catch(e => setState({ loading: false, ctx: null, error: e instanceof ApiError ? e : new ApiError(0, 'error', 'Unexpected error') }))
  }, [])
  useEffect(load, [load])
  return <C.Provider value={{ ...state, reload: load }}>{children}</C.Provider>
}

export const useRevenue = () => useContext(C)

export const canRole = (role: string | undefined, action: 'sync' | 'approve' | 'propose' | 'triage' | 'admin'): boolean => {
  const r = role ?? 'viewer'
  switch (action) {
    case 'sync': case 'approve': return r === 'admin' || r === 'manager'
    case 'propose': case 'triage': return r !== 'viewer'
    case 'admin': return r === 'admin'
  }
}
