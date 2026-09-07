import { useState, useEffect, useCallback } from 'react'
import { fetchMqlSnapshot } from '../lib/demand/mqls'
import { fetchTrafficSnapshot } from '../lib/demand/traffic'
import { upsertProspects } from '../lib/outbound/store'
import type { MQL, MqlSnapshot, TrafficSnapshot } from '../lib/demand/types'

type Notify = (msg: string, type?: 'success' | 'error') => void

const EMPTY_MQL: MqlSnapshot = { mqls: [], mqlsThisMonth: 0, demo: true, sources: [] }
const EMPTY_TRAFFIC: TrafficSnapshot = { monthlyVisitors: 0, channels: [], topPages: [], demo: true }

export function useDemandGen(notify: Notify) {
  const [mqlSnapshot, setMqlSnapshot] = useState<MqlSnapshot>(EMPTY_MQL)
  const [traffic, setTraffic] = useState<TrafficSnapshot>(EMPTY_TRAFFIC)
  const [loading, setLoading] = useState(true)
  const [routing, setRouting] = useState<string | null>(null)
  const [routed, setRouted] = useState<Set<string>>(new Set())

  const reload = useCallback(async () => {
    setLoading(true)
    const [mqlRes, trafficRes] = await Promise.allSettled([fetchMqlSnapshot(), fetchTrafficSnapshot()])
    if (mqlRes.status === 'fulfilled') setMqlSnapshot(mqlRes.value)
    else notify(mqlRes.reason instanceof Error ? mqlRes.reason.message : 'Failed to load MQLs', 'error')
    if (trafficRes.status === 'fulfilled') setTraffic(trafficRes.value)
    else notify(trafficRes.reason instanceof Error ? trafficRes.reason.message : 'Failed to load traffic data', 'error')
    setLoading(false)
  }, [notify])

  useEffect(() => { reload() }, [reload])

  const routeToOutbound = useCallback(async (mql: MQL) => {
    setRouting(mql.id)
    try {
      await upsertProspects([{
        firstName: mql.firstName,
        lastName: mql.lastName,
        email: mql.email,
        title: mql.title,
        company: mql.company,
        source: 'hubspot',
        externalId: mql.id,
      }])
      setRouted(prev => new Set(prev).add(mql.id))
      notify(`${mql.firstName || mql.email} routed to Outbound`)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not route to Outbound', 'error')
    } finally {
      setRouting(null)
    }
  }, [notify])

  return {
    mqls: mqlSnapshot.mqls,
    mqlsThisMonth: mqlSnapshot.mqlsThisMonth,
    demoMql: mqlSnapshot.demo,
    traffic,
    loading,
    routing,
    routed,
    routeToOutbound,
    refresh: reload,
  }
}
