import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from '../ui/Icon'
import { api, ApiError } from '../../lib/revenue/api'
import { t } from '../../lib/revenue/i18n'
import type { JobResponse, CurrencyKpi } from '../../lib/revenue/types'
import { formatMoney } from '../../lib/revenue/format'

export function StateBox({ icon = 'info', title, desc, action, tone = 'neutral' }: { icon?: string; title: string; desc?: string; action?: ReactNode; tone?: 'neutral' | 'warn' | 'error' }) {
  return (
    <div className={`rv-state rv-state-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={icon as never} size={22} />
      <div className="rv-state-title">{title}</div>
      {desc && <div className="rv-state-desc">{desc}</div>}
      {action && <div className="rv-state-action">{action}</div>}
    </div>
  )
}

export function Loading({ label }: { label?: string }) {
  return <div className="rv-loading" role="status" aria-live="polite">{label ?? t('common.loading')}</div>
}

// Turns any ApiError into an actionable message, with the request reference for support.
export function ErrorBox({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const msg = error.status === 0 ? t('common.network') : error.status === 503 ? t('common.unavailable') : error.status === 403 ? (error.code === 'feature_disabled' ? error.message : t('common.no_permission')) : error.message
  return (
    <StateBox icon="warning" tone="error" title={msg} desc={error.requestId ? `${t('common.request_ref')}: ${error.requestId}` : undefined}
      action={onRetry && <button className="btn-sm btn-sm-ghost" onClick={onRetry}>{t('common.retry')}</button>} />
  )
}

export function HealthBadge({ band, health }: { band: string; health: number | null }) {
  return <span className={`rv-badge rv-band-${band}`} title={t(`band.${band}`)}>{health === null ? '—' : health} · {t(`band.${band}`)}</span>
}
export const SeverityBadge = ({ s }: { s: string }) => <span className={`rv-badge rv-sev-${s}`}>{t(`sev.${s}`)}</span>
export const Chip = ({ children }: { children: ReactNode }) => <span className="rv-chip">{children}</span>

export function MoneyByCurrency({ rows, pick }: { rows: CurrencyKpi[]; pick: 'open_pipeline' | 'at_risk_amount' | 'provisional_at_risk_amount' }) {
  if (!rows.length) return <span>—</span>
  return (
    <div className="rv-money-list">
      {rows.map(r => (
        <div key={r.currency ?? 'unknown'}>{formatMoney(r[pick], r.currency)}{!r.currency && ` · ${t('common.unknown')}`}</div>
      ))}
    </div>
  )
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); prev?.focus() }
  }, [onClose])
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose} aria-label={t('common.close')}><Icon name="close" size={13} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

// Sync with visible progress: enqueue (202), drive the worker for this org, poll the job.
export function useSync(onDone?: () => void) {
  const [running, setRunning] = useState(false)
  const [step, setStep] = useState<string | null>(null)
  const [counters, setCounters] = useState<Record<string, number>>({})
  const [error, setError] = useState<ApiError | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const stop = useRef(false)
  useEffect(() => () => { stop.current = true }, [])

  const start = useCallback(async (full = false) => {
    setRunning(true); setError(null); setStep('queued'); setWarnings([])
    try {
      const s = await api<{ job_id?: string; sync_run_id: string; deduped?: boolean }>('revenue/sync', { method: 'POST', body: { full } })
      for (let i = 0; i < 240 && !stop.current; i++) {
        await api('revenue/worker/kick', { method: 'POST', body: {} }).catch(() => undefined)
        if (!s.job_id) { await new Promise(r => setTimeout(r, 2000)) }
        const runId = s.sync_run_id
        const j = s.job_id ? await api<JobResponse>(`revenue/jobs/${s.job_id}`, { query: { run: runId } }) : null
        if (j?.sync_run) { setStep(j.sync_run.step); setCounters(j.sync_run.counters); setWarnings(j.sync_run.warnings ?? []) }
        if (j && (j.job.status === 'succeeded' || j.job.status === 'failed' || j.job.status === 'dead')) {
          if (j.sync_run?.status === 'failed') throw new ApiError(500, 'sync_failed', j.sync_run.error ?? 'Sync failed')
          break
        }
        await new Promise(r => setTimeout(r, 1500))
      }
      // the sync enqueues an evaluation job: drive it too
      for (let i = 0; i < 6; i++) { const k = await api<{ processed: number }>('revenue/worker/kick', { method: 'POST', body: {} }).catch(() => ({ processed: 0 })); if (!k.processed) break }
      onDone?.()
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'error', 'Sync failed'))
    } finally { setRunning(false) }
  }, [onDone])
  return { running, step, counters, error, warnings, start }
}

const ProposeSchema = { subject: 200, body: 2000 }

export function ProposeTaskModal({ dealId, dealName, defaultSubject, rationale, onClose, onCreated, addToast }: {
  dealId: string; dealName: string | null; defaultSubject?: string; rationale?: string | null; onClose: () => void; onCreated: () => void; addToast: (m: string, ty?: 'success' | 'error') => void
}) {
  const [subject, setSubject] = useState(defaultSubject ?? '')
  const [body, setBody] = useState('')
  const [due, setDue] = useState(() => new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<ApiError | null>(null)
  const submit = async () => {
    setBusy(true); setErr(null)
    try {
      await api('revenue/actions', { method: 'POST', body: { deal_id: dealId, kind: 'create_task', rationale, payload: { subject, body, due_at: new Date(`${due}T12:00:00`).toISOString() } } })
      addToast('Draft created — it needs approval before anything reaches HubSpot')
      onCreated(); onClose()
    } catch (e) { setErr(e instanceof ApiError ? e : new ApiError(0, 'error', 'Failed')) } finally { setBusy(false) }
  }
  return (
    <Modal title={`${t('doctor.propose_task')} — ${dealName ?? ''}`} onClose={onClose} footer={
      <>
        <button className="btn-sm btn-sm-ghost" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn-sm btn-sm-primary" disabled={busy || !subject.trim()} onClick={submit}>{busy ? '…' : 'Create draft'}</button>
      </>
    }>
      <p className="rv-muted" style={{ marginBottom: 12 }}>{t('actions.subtitle')}</p>
      <div className="form-group"><label className="form-label" htmlFor="pt-subject">Subject</label>
        <input id="pt-subject" className="form-input" maxLength={ProposeSchema.subject} value={subject} onChange={e => setSubject(e.target.value)} /></div>
      <div className="form-group"><label className="form-label" htmlFor="pt-body">Notes</label>
        <textarea id="pt-body" className="form-input" rows={3} maxLength={ProposeSchema.body} value={body} onChange={e => setBody(e.target.value)} /></div>
      <div className="form-group"><label className="form-label" htmlFor="pt-due">Due date</label>
        <input id="pt-due" type="date" className="form-input" value={due} onChange={e => setDue(e.target.value)} /></div>
      {err && <div role="alert" className="rv-inline-error">{err.message}{err.requestId ? ` (${t('common.request_ref')}: ${err.requestId})` : ''}</div>}
    </Modal>
  )
}
