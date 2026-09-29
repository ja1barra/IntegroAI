import { useState } from 'react'
import { api, ApiError } from '../../lib/revenue/api'
import { useApi } from '../../lib/revenue/useApi'
import { useRevenue, canRole } from '../../lib/revenue/RevenueContext'
import { t } from '../../lib/revenue/i18n'
import { formatDate } from '../../lib/revenue/format'
import type { Proposal } from '../../lib/revenue/types'
import { StateBox, Loading, ErrorBox, Modal, Chip } from '../../components/revenue/common'
import type { RevenueViewProps } from './OverviewView'

const OPEN_STATES = ['proposed', 'approved', 'executing', 'needs_review', 'conflict']

export default function ActionsView({ active, addToast, onOpenDeal }: RevenueViewProps) {
  const { ctx } = useRevenue()
  const [status, setStatus] = useState('')
  const { data, error, loading, reload } = useApi<{ items: Proposal[] }>('revenue/actions', { status }, active)
  const [sel, setSel] = useState<Proposal | null>(null)
  const [editing, setEditing] = useState<Proposal | null>(null)
  const [rejecting, setRejecting] = useState<Proposal | null>(null)
  const [busy, setBusy] = useState(false)
  const writes = ctx?.flags.hubspot_write_actions_enabled ?? false
  const current = sel ? data?.items.find(p => p.id === sel.id) ?? sel : null

  const kick = async () => { for (let i = 0; i < 5; i++) { const k = await api<{ processed: number }>('revenue/worker/kick', { method: 'POST', body: {} }).catch(() => ({ processed: 0 })); if (!k.processed) break } }
  const approve = async (p: Proposal) => {
    setBusy(true)
    try {
      await api(`revenue/actions/${p.id}/approve`, { method: 'POST', body: { version: p.version, payload_hash: p.payload_hash } })
      await kick(); reload(); addToast('Approved — executing in HubSpot')
    } catch (e) { addToast(e instanceof ApiError ? e.message : 'Failed', 'error'); reload() } finally { setBusy(false) }
  }

  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="view-header"><div><div className="view-subtitle">{t('actions.subtitle')}</div><h1 className="display view-title">{t('actions.title')}</h1></div>
        <div className="view-actions"><label className="rv-sr" htmlFor="act-status">Status</label>
          <select id="act-status" className="form-input" value={status} onChange={e => setStatus(e.target.value)}><option value="">All</option>{['proposed', 'approved', 'succeeded', 'rejected', 'failed', 'conflict', 'needs_review', 'expired', 'cancelled'].map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</select></div></div>
      {ctx && !writes && <div className="rv-note">{t('actions.disabled')}</div>}
      {!data && loading && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && data.items.length === 0 && <StateBox icon="approvals" title={t('actions.empty')} desc="Propose a task from Pipeline Doctor, a deal, or ask Integro." />}
      {data && data.items.length > 0 && (
        <div className="rv-split rv-split-wide">
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="data-table"><caption className="rv-sr">{t('actions.title')}</caption>
              <thead><tr><th scope="col">Action</th><th scope="col">Deal</th><th scope="col">{t('actions.author')}</th><th scope="col">{t('actions.version')}</th><th scope="col">Status</th></tr></thead>
              <tbody>{data.items.map(p => (
                <tr key={p.id} className={current?.id === p.id ? 'is-selected' : ''}>
                  <td><button className="rv-link" onClick={() => setSel(p)}>{t(`kind.${p.kind}`)}</button></td>
                  <td><button className="rv-link" onClick={() => onOpenDeal(p.deal_id)}>open deal</button></td>
                  <td>{p.source === 'ai' ? 'Integro AI' : 'A teammate'}</td><td>v{p.version}</td>
                  <td><span className={`rv-badge rv-status-${p.status}`}>{t(`status.${p.status}`)}</span></td>
                </tr>))}</tbody></table>
          </div>
          {current && (
            <aside className="card rv-action-detail" aria-label="Action details">
              <h2 className="rv-h2">{t(`kind.${current.kind}`)} <Chip>v{current.version}</Chip></h2>
              <span className={`rv-badge rv-status-${current.status}`}>{t(`status.${current.status}`)}</span>
              <PayloadView p={current} />
              {current.rationale && <div><strong>{t('actions.rationale')}:</strong> {current.rationale}</div>}
              <div className="rv-muted">{t('actions.author')}: {current.source === 'ai' ? 'Integro AI (draft)' : 'teammate'} · {formatDate(current.created_at, undefined, true)}</div>
              <div className="rv-muted">{t('actions.approver')}: {current.approved_at ? `${current.approved_by ? 'manager/admin' : '—'} · ${formatDate(current.approved_at, undefined, true)}` : '—'}</div>
              <div className="rv-muted">Expires {formatDate(current.expires_at, undefined, true)} · hash <code>{current.payload_hash.slice(0, 10)}</code></div>
              {current.result?.external_result_id && <div className="rv-muted">HubSpot id: <code>{current.result.external_result_id}</code></div>}
              {current.result?.error && <div className="rv-inline-error">{current.result.error}</div>}
              {current.status === 'needs_review' && <div className="rv-note">The outcome is uncertain (for example a timeout). Check the deal in HubSpot before doing anything else; Integro will not retry blindly.</div>}
              {current.status === 'conflict' && <div className="rv-note">The deal changed in HubSpot after this was proposed. Create a new proposal from the current data.</div>}
              <div className="rv-row">
                {['proposed', 'approved'].includes(current.status) && canRole(ctx?.role, 'propose') && current.kind !== 'update_deal_fields' && <button className="btn-sm btn-sm-ghost" onClick={() => setEditing(current)}>{t('actions.edit')}</button>}
                {current.status === 'proposed' && canRole(ctx?.role, 'approve') && <button className="btn-sm btn-sm-primary" disabled={busy || (!writes && current.kind !== 'email_draft')} onClick={() => void approve(current)}>{t('actions.approve')}</button>}
                {OPEN_STATES.slice(0, 2).includes(current.status) && canRole(ctx?.role, 'approve') && <button className="btn-sm btn-sm-ghost" onClick={() => setRejecting(current)}>{t('actions.reject')}</button>}
              </div>
              <div className="rv-muted">{t('actions.edit_invalidates')}</div>
            </aside>
          )}
        </div>
      )}
      {editing && <EditModal p={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); addToast('New version saved — it needs a fresh approval') }} />}
      {rejecting && <RejectModal p={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); reload() }} />}
    </div>
  )
}

function PayloadView({ p }: { p: Proposal }) {
  const pl = p.payload as Record<string, unknown> & { changes?: Record<string, { before: string | null; after: string }> }
  if (p.kind === 'update_deal_fields' && pl.changes) {
    return <table className="data-table"><thead><tr><th scope="col">Field</th><th scope="col">Before</th><th scope="col">After</th></tr></thead>
      <tbody>{Object.entries(pl.changes).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v.before ?? '—'}</td><td><strong>{v.after}</strong></td></tr>)}</tbody></table>
  }
  return (
    <dl className="rv-facts rv-facts-col">
      <div><span>Subject</span>{String(pl.subject ?? '')}</div>
      {p.kind === 'create_task' && <div><span>Due</span>{formatDate(String(pl.due_at ?? ''), undefined, true)}</div>}
      <div><span>{p.kind === 'email_draft' ? 'Draft (copy only)' : 'Notes'}</span><pre className="rv-pre">{String(pl.body ?? '')}</pre></div>
      {p.kind === 'create_task' && <div><span>Assigned to</span>{pl.owner_external_id ? `HubSpot owner ${String(pl.owner_external_id)}` : 'Deal owner'}</div>}
    </dl>
  )
}

function EditModal({ p, onClose, onSaved }: { p: Proposal; onClose: () => void; onSaved: () => void }) {
  const pl = p.payload as { subject?: string; body?: string; due_at?: string; owner_external_id?: string | null }
  const [subject, setSubject] = useState(pl.subject ?? '')
  const [body, setBody] = useState(pl.body ?? '')
  const originalDue = (pl.due_at ?? new Date().toISOString()).slice(0, 10)
  const [due, setDue] = useState(originalDue)
  const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    try {
      // Keep everything the user did not touch: the assignee, and the exact due timestamp unless the date was changed.
      const payload = p.kind === 'create_task'
        ? { subject, body, due_at: due === originalDue && pl.due_at ? pl.due_at : new Date(`${due}T12:00:00`).toISOString(), ...(pl.owner_external_id ? { owner_external_id: pl.owner_external_id } : {}) }
        : { subject, body }
      await api(`revenue/actions/${p.id}/edit`, { method: 'POST', body: { version: p.version, payload } })
      onSaved()
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed') }
  }
  return (
    <Modal title={`${t('actions.edit')} — ${t(`kind.${p.kind}`)}`} onClose={onClose} footer={<><button className="btn-sm btn-sm-ghost" onClick={onClose}>{t('common.cancel')}</button><button className="btn-sm btn-sm-primary" onClick={save}>{t('common.save')}</button></>}>
      <p className="rv-muted">{t('actions.edit_invalidates')}</p>
      <div className="form-group"><label className="form-label" htmlFor="ed-s">Subject</label><input id="ed-s" className="form-input" value={subject} onChange={e => setSubject(e.target.value)} /></div>
      <div className="form-group"><label className="form-label" htmlFor="ed-b">Notes</label><textarea id="ed-b" className="form-input" rows={4} value={body} onChange={e => setBody(e.target.value)} /></div>
      {p.kind === 'create_task' && <div className="form-group"><label className="form-label" htmlFor="ed-d">Due date</label><input id="ed-d" type="date" className="form-input" value={due} onChange={e => setDue(e.target.value)} /></div>}
      {err && <div role="alert" className="rv-inline-error">{err}</div>}
    </Modal>
  )
}

function RejectModal({ p, onClose, onDone }: { p: Proposal; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const go = async () => { try { await api(`revenue/actions/${p.id}/reject`, { method: 'POST', body: { reason } }); onDone() } catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed') } }
  return (
    <Modal title={t('actions.reject')} onClose={onClose} footer={<><button className="btn-sm btn-sm-ghost" onClick={onClose}>{t('common.cancel')}</button><button className="btn-sm btn-sm-primary" onClick={go}>{t('actions.reject')}</button></>}>
      <div className="form-group"><label className="form-label" htmlFor="rj-r">Reason</label><textarea id="rj-r" className="form-input" rows={3} value={reason} onChange={e => setReason(e.target.value)} /></div>
      {err && <div role="alert" className="rv-inline-error">{err}</div>}
    </Modal>
  )
}
