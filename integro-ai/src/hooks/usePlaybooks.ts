import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Playbook, PlaybookInput, PlaybookStatus } from '../lib/playbooks/types'
import * as store from '../lib/playbooks/store'
import { buildCrmSummary, summarizeCrmForPrompt } from '../lib/playbooks/crmSummary'
import { generatePlaybookFromCrm, generatePlaybookFromWeb, type Sender, type GeneratedPlaybook } from '../lib/playbooks/generate'
import type { SourceRef } from '../lib/playbooks/types'

type Notify = (msg: string, type?: 'success' | 'error') => void

// Turns the AI's { title, description, category, plays, tags } shape into
// a full PlaybookInput ready to persist, tagging provenance and (for CRM
// mode) attaching the real numbers from the summary rather than trusting
// the model's arithmetic.
function toInput(
  g: GeneratedPlaybook,
  extra: {
    source: 'ai_crm' | 'ai_web'
    winRatePct?: number | null
    avgDealCycleDays?: number | null
    sourcesUsed?: SourceRef[]
    crmSummary?: string | null
  },
): PlaybookInput {
  return {
    title: g.title,
    description: g.description,
    category: g.category,
    status: 'draft',
    source: extra.source,
    plays: g.plays.map(p => ({ id: crypto.randomUUID(), title: p.title, description: p.description })),
    tags: g.tags,
    winRatePct: extra.winRatePct ?? null,
    avgDealCycleDays: extra.avgDealCycleDays ?? null,
    sourcesUsed: extra.sourcesUsed ?? [],
    crmSummary: extra.crmSummary ?? null,
  }
}

export function usePlaybooks(sender: Sender, notify: Notify) {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)   // 'crm' | 'web' | null

  const reload = useCallback(async () => {
    try {
      setPlaybooks(await store.listPlaybooks())
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to load playbooks', 'error')
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => { reload() }, [reload])

  const addPlaybook = useCallback(async (input: PlaybookInput) => {
    try {
      const created = await store.createPlaybook(input)
      setPlaybooks(p => [created, ...p])
      notify('Playbook created')
      return created
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not create playbook', 'error')
      return null
    }
  }, [notify])

  const editPlaybook = useCallback(async (id: string, input: PlaybookInput) => {
    try {
      const updated = await store.updatePlaybook(id, input)
      setPlaybooks(p => p.map(pb => pb.id === id ? updated : pb))
      notify('Playbook updated')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update playbook', 'error')
    }
  }, [notify])

  const removePlaybook = useCallback(async (id: string) => {
    setPlaybooks(p => p.filter(pb => pb.id !== id))
    try { await store.deletePlaybook(id) }
    catch (err) { notify(err instanceof Error ? err.message : 'Delete failed', 'error'); reload() }
  }, [notify, reload])

  const setStatus = useCallback(async (id: string, status: PlaybookStatus) => {
    setPlaybooks(p => p.map(pb => pb.id === id ? { ...pb, status } : pb))
    try { await store.setPlaybookStatus(id, status) }
    catch (err) { notify(err instanceof Error ? err.message : 'Update failed', 'error'); reload() }
  }, [notify, reload])

  // ── AI generation ────────────────────────────────────────────
  // Both return the draft for the caller to preview before saving — they
  // do not persist automatically, so a bad generation costs nothing.

  const generateFromCrm = useCallback(async (topic?: string) => {
    setBusy('crm')
    try {
      const summary = await buildCrmSummary()
      const crmContext = summarizeCrmForPrompt(summary)
      const res = await generatePlaybookFromCrm(sender, crmContext, topic)
      if (!res.ok || !res.playbook) {
        notify(res.error ?? 'Generation failed', 'error')
        return null
      }
      return {
        input: toInput(res.playbook, {
          source: 'ai_crm',
          winRatePct: summary.winRatePct,
          avgDealCycleDays: null,
          crmSummary: crmContext,
        }),
        demo: summary.demo,
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Generation failed', 'error')
      return null
    } finally {
      setBusy(null)
    }
  }, [sender, notify])

  const generateFromWeb = useCallback(async (topic: string) => {
    if (!topic.trim()) { notify('Describe what to research first', 'error'); return null }
    setBusy('web')
    try {
      const res = await generatePlaybookFromWeb(sender, topic)
      if (!res.ok || !res.playbook) {
        notify(res.error ?? 'Generation failed', 'error')
        return null
      }
      return {
        input: toInput(res.playbook, { source: 'ai_web', sourcesUsed: res.sources ?? [] }),
        demo: false,
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Generation failed', 'error')
      return null
    } finally {
      setBusy(null)
    }
  }, [sender, notify])

  const stats = useMemo(() => {
    const active = playbooks.filter(p => p.status === 'active')
    const withWinRate = playbooks.filter(p => p.winRatePct !== null)
    const avgWinRate = withWinRate.length
      ? Math.round(withWinRate.reduce((sum, p) => sum + (p.winRatePct ?? 0), 0) / withWinRate.length)
      : null
    const withCycle = playbooks.filter(p => p.avgDealCycleDays !== null)
    const avgCycle = withCycle.length
      ? Math.round(withCycle.reduce((sum, p) => sum + (p.avgDealCycleDays ?? 0), 0) / withCycle.length)
      : null
    return {
      total: playbooks.length,
      active: active.length,
      avgWinRate,
      avgDealCycleDays: avgCycle,
    }
  }, [playbooks])

  return {
    playbooks, loading, busy, stats,
    reload,
    addPlaybook, editPlaybook, removePlaybook, setStatus,
    generateFromCrm, generateFromWeb,
  }
}
