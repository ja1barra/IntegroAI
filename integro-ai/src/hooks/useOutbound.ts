import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Prospect, Sequence, Message, Enrollment, OutboundStats, ProspectInput } from '../lib/outbound/types'
import * as store from '../lib/outbound/store'
import { generateDrafts, type Sender } from '../lib/outbound/generate'
import { getMailbox, sendEmail, connectGmail, type Mailbox } from '../lib/outbound/send'
import { syncCrmProspects } from '../lib/outbound/sync'

type Notify = (msg: string, type?: 'success' | 'error') => void

export function useOutbound(sender: Sender, notify: Notify) {
  const [prospects, setProspects]     = useState<Prospect[]>([])
  const [sequences, setSequences]     = useState<Sequence[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [messages, setMessages]       = useState<Message[]>([])
  const [loading, setLoading]         = useState(true)
  const [busy, setBusy]               = useState<string | null>(null)   // label of in-flight action
  const [mailbox, setMailbox]         = useState<Mailbox | null>(null)

  const reload = useCallback(async () => {
    try {
      const [p, s, e, m, mb] = await Promise.all([
        store.listProspects(),
        store.listSequences(),
        store.listEnrollments(),
        store.listMessages(),
        getMailbox().catch(() => null),
      ])
      setProspects(p); setSequences(s); setEnrollments(e); setMessages(m); setMailbox(mb)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to load outbound data', 'error')
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => { reload() }, [reload])

  // ── Prospects ──────────────────────────────────────────────
  const syncProspects = useCallback(async () => {
    setBusy('sync')
    const run = await store.startRun('sync')
    try {
      const res = await syncCrmProspects()
      await store.finishRun(run, 'completed', res.synced)
      notify(
        res.synced === 0
          ? 'No new prospects found'
          : `Synced ${res.synced} prospect${res.synced === 1 ? '' : 's'}${res.demo ? ' (demo data — connect a CRM for live sync)' : ` from ${res.sources.join(', ')}`}`,
      )
      setProspects(await store.listProspects())
    } catch (err) {
      await store.finishRun(run, 'failed', 0, err instanceof Error ? err.message : undefined)
      notify(err instanceof Error ? err.message : 'Sync failed', 'error')
    } finally {
      setBusy(null)
    }
  }, [notify])

  const addProspect = useCallback(async (input: ProspectInput) => {
    try {
      await store.upsertProspects([input])
      setProspects(await store.listProspects())
      notify('Prospect added')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not add prospect', 'error')
    }
  }, [notify])

  const removeProspect = useCallback(async (id: string) => {
    setProspects(prev => prev.filter(p => p.id !== id))
    try { await store.deleteProspect(id) }
    catch (err) { notify(err instanceof Error ? err.message : 'Delete failed', 'error'); reload() }
  }, [notify, reload])

  // ── Sequences ──────────────────────────────────────────────
  const saveSequence = useCallback(async (seq: Sequence) => {
    try {
      await store.saveSequence(seq)
      setSequences(await store.listSequences())
      notify(`Sequence "${seq.name}" saved`)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Save failed', 'error')
    }
  }, [notify])

  const removeSequence = useCallback(async (id: string) => {
    setSequences(prev => prev.filter(s => s.id !== id))
    try { await store.deleteSequence(id) }
    catch (err) { notify(err instanceof Error ? err.message : 'Delete failed', 'error'); reload() }
  }, [notify, reload])

  const toggleSequenceActive = useCallback(async (id: string) => {
    const seq = sequences.find(s => s.id === id)
    if (!seq) return
    const next = seq.status === 'active' ? 'draft' : 'active'
    setSequences(prev => prev.map(s => s.id === id ? { ...s, status: next } : s))
    try { await store.setSequenceStatus(id, next) }
    catch (err) { notify(err instanceof Error ? err.message : 'Update failed', 'error'); reload() }
  }, [sequences, notify, reload])

  // ── Enroll + generate ──────────────────────────────────────
  // Enroll the given prospects into a sequence and generate a personalized
  // first-email draft for each, landing them in the review queue.
  const enrollAndGenerate = useCallback(async (sequenceId: string, prospectIds: string[]) => {
    const seq = sequences.find(s => s.id === sequenceId)
    if (!seq) { notify('Sequence not found', 'error'); return }
    const firstEmail = seq.steps.find(s => s.type === 'email')
    if (!firstEmail) { notify('This sequence has no email step to generate', 'error'); return }
    const targets = prospects.filter(p => prospectIds.includes(p.id))
    if (targets.length === 0) { notify('Select at least one prospect', 'error'); return }

    setBusy('generate')
    const run = await store.startRun('generate', { sequenceId, count: targets.length })
    try {
      const enrolled = await store.enrollProspects(sequenceId, prospectIds)
      const enrollByProspect = new Map(enrolled.map(e => [e.prospectId, e.id]))

      const { drafts, usedAI } = await generateDrafts(targets, firstEmail, sender)
      await store.insertMessages(
        drafts.map(d => ({
          prospectId: d.prospectId,
          sequenceId,
          enrollmentId: enrollByProspect.get(d.prospectId) ?? null,
          stepId: firstEmail.id.length === 36 ? firstEmail.id : null, // only real UUIDs
          subject: d.subject,
          body: d.body,
          status: 'draft' as const,
          generatedBy: 'ai' as const,
        })),
      )
      await store.finishRun(run, 'completed', drafts.length)
      await reload()
      notify(`Generated ${drafts.length} draft${drafts.length === 1 ? '' : 's'}${usedAI ? '' : ' (demo personalization — add ANTHROPIC_API_KEY for live AI)'}`)
    } catch (err) {
      await store.finishRun(run, 'failed', 0, err instanceof Error ? err.message : undefined)
      notify(err instanceof Error ? err.message : 'Generation failed', 'error')
    } finally {
      setBusy(null)
    }
  }, [sequences, prospects, sender, notify, reload])

  // ── Review queue actions ───────────────────────────────────
  const editMessage = useCallback(async (id: string, patch: { subject?: string; body?: string }) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
    try { await store.updateMessage(id, patch) }
    catch (err) { notify(err instanceof Error ? err.message : 'Save failed', 'error'); reload() }
  }, [notify, reload])

  const approveMessage = useCallback(async (id: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'approved' } : m))
    try { await store.updateMessage(id, { status: 'approved' }) }
    catch (err) { notify(err instanceof Error ? err.message : 'Approve failed', 'error'); reload() }
  }, [notify, reload])

  const discardMessage = useCallback(async (id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id))
    try { await store.deleteMessage(id) }
    catch (err) { notify(err instanceof Error ? err.message : 'Discard failed', 'error'); reload() }
  }, [notify, reload])

  // Send one message via the connected mailbox.
  const sendOne = useCallback(async (id: string, mailbox: Awaited<ReturnType<typeof getMailbox>>) => {
    const msg = messages.find(m => m.id === id)
    if (!msg || !msg.prospect?.email) return false
    await store.updateMessage(id, { status: 'sending' })
    const res = await sendEmail(mailbox, msg.prospect.email, msg.subject, msg.body)
    if (res.ok) {
      await store.updateMessage(id, { status: 'sent', sentAt: new Date().toISOString(), mailbox: mailbox?.provider ?? 'demo', providerMsgId: res.id, error: null })
      if (msg.prospectId) await store.setProspectStatus(msg.prospectId, 'contacted')
      return true
    } else {
      await store.updateMessage(id, { status: 'failed', error: res.error ?? 'Send failed' })
      return false
    }
  }, [messages])

  // Send all approved messages (auto-send / bulk send).
  const sendApproved = useCallback(async () => {
    const approved = messages.filter(m => m.status === 'approved')
    if (approved.length === 0) { notify('No approved emails to send', 'error'); return }
    setBusy('send')
    const run = await store.startRun('send', { count: approved.length })
    const mb = await getMailbox()
    let sent = 0, failed = 0
    try {
      for (const m of approved) {
        const ok = await sendOne(m.id, mb)
        ok ? sent++ : failed++
      }
      await store.finishRun(run, 'completed', sent)
      await reload()
      const via = mb && mb.token && !mb.token.includes('demo') ? mb.provider : 'demo mailbox'
      notify(
        `${sent} email${sent === 1 ? '' : 's'} sent via ${via}${failed ? `, ${failed} failed` : ''}${!mb ? ' — connect a mailbox to send for real' : ''}`,
        failed ? 'error' : 'success',
      )
    } catch (err) {
      await store.finishRun(run, 'failed', sent, err instanceof Error ? err.message : undefined)
      notify(err instanceof Error ? err.message : 'Send failed', 'error')
    } finally {
      setBusy(null)
    }
  }, [messages, sendOne, notify, reload])

  const connectMailbox = useCallback(async () => {
    setBusy('mailbox')
    try {
      const res = await connectGmail()
      if (res.ok) { setMailbox(await getMailbox()); notify('Gmail mailbox connected — emails will send for real') }
      else notify(res.error ?? 'Could not connect mailbox', 'error')
    } finally {
      setBusy(null)
    }
  }, [notify])

  // ── Derived stats ──────────────────────────────────────────
  const stats: OutboundStats = useMemo(() => {
    const activeEnroll = enrollments.filter(e => e.status === 'active').length
    const sent = messages.filter(m => m.status === 'sent').length
    const replied = messages.filter(m => m.status === 'replied').length
    const meetings = prospects.filter(p => p.status === 'meeting').length
    const drafts = messages.filter(m => m.status === 'draft').length
    return {
      inSequence: activeEnroll,
      sent,
      replied,
      meetings,
      drafts,
      replyRate: sent ? Math.round((replied / sent) * 100) : 0,
    }
  }, [enrollments, messages, prospects])

  const mailboxConnected = !!(mailbox && mailbox.token && !mailbox.token.includes('demo'))

  return {
    prospects, sequences, enrollments, messages, loading, busy, stats,
    mailbox, mailboxConnected,
    reload,
    syncProspects, addProspect, removeProspect,
    saveSequence, removeSequence, toggleSequenceActive,
    enrollAndGenerate,
    editMessage, approveMessage, discardMessage, sendApproved, connectMailbox,
  }
}
