import { useMemo, useState } from 'react'
import { api, ApiError } from '../../lib/revenue/api'
import { useApi } from '../../lib/revenue/useApi'
import { useRevenue, canRole } from '../../lib/revenue/RevenueContext'
import { t } from '../../lib/revenue/i18n'
import { formatMoney, formatDate } from '../../lib/revenue/format'
import type { FindingsResponse, Finding, Overview } from '../../lib/revenue/types'
import { StateBox, Loading, ErrorBox, SeverityBadge, Modal, ProposeTaskModal, Chip } from '../../components/revenue/common'
import type { RevenueViewProps } from './OverviewView'
import { CoverageBanner } from './OverviewView'

const CATEGORIES = ['inactivity', 'next_step', 'stalled', 'close_date', 'single_contact', 'owner', 'data_quality']

export default function PipelineDoctorView({ active, addToast, onNavigate, onOpenDeal }: RevenueViewProps) {
  const { ctx } = useRevenue()
  const [filters, setFilters] = useState<Record<string, string>>({ status: 'open' })
  const [offset, setOffset] = useState(0)
  const query = useMemo(() => ({ ...filters, offset }), [filters, offset])
  const ov = useApi<Overview>('revenue/overview', {}, active)
  const { data, error, loading, reload } = useApi<FindingsResponse>('revenue/findings', query, active)
  const [pref, setPref] = useState<{ f: Finding; state: 'dismissed' | 'snoozed' } | null>(null)
  const [task, setTask] = useState<Finding | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const set = (k: string, v: string) => { setOffset(0); setFilters(f => { const n = { ...f }; if (v) n[k] = v; else delete n[k]; return n }) }
  const opts = ov.data?.filter_options

  const sel = (k: string, label: string, options: { id: string; label: string }[]) => (
    <label className="rv-filter"><span>{label}</span>
      <select className="form-input" value={filters[k] ?? ''} onChange={e => set(k, e.target.value)}>
        <option value="">All</option>{options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select></label>
  )

  let body
  if (!data && loading) body = <Loading />
  else if (error) body = <ErrorBox error={error} onRetry={reload} />
  else if (data && !data.snapshot) body = <StateBox icon="pipeline" title={t('state.no_snapshot.title')} desc={t('state.no_snapshot.desc')} action={<button className="btn-sm btn-sm-primary" onClick={() => onNavigate('rv-settings')}>{t('nav.integrations')}</button>} />
  else if (data) {
    body = (
      <>
        {ov.data && <CoverageBanner ov={ov.data} />}
        <div className="rv-groups">
          {data.groups.map(g => (
            <button key={g.category} className={`card rv-group ${filters.category === g.category ? 'is-selected' : ''}`} onClick={() => set('category', filters.category === g.category ? '' : g.category)} aria-pressed={filters.category === g.category}>
              <div className="stat-label">{t(`cat.${g.category}`)}</div>
              <div className="rv-kpi-value" style={{ fontSize: 30 }}>{g.findings}</div>
              <div className="rv-muted">{g.unique_deals} {t('doctor.unique_deals')}</div>
              <div className="rv-muted">{g.unique_amount_by_currency.map(a => `${formatMoney(a.amount, a.currency)}${a.unknown_amount_deals ? ` (+${a.unknown_amount_deals} ${t('common.unknown').toLowerCase()})` : ''}`).join(' · ') || '—'}</div>
            </button>
          ))}
        </div>
        <div className="rv-note">{t('doctor.note_hidden')}</div>
        {data.items.length === 0 ? <StateBox icon="checkCircle" title={t('doctor.empty')} /> : (
          <div className="card" style={{ padding: 0 }}>
            <table className="data-table">
              <caption className="rv-sr">{t('doctor.title')}</caption>
              <thead><tr><th scope="col">Severity</th><th scope="col">Deal</th><th scope="col">Issue</th><th scope="col">Owner</th><th scope="col">Amount</th><th scope="col">{t('doctor.age_days')}</th><th scope="col"><span className="rv-sr">Actions</span></th></tr></thead>
              <tbody>
                {data.items.map(f => (
                  <FindingRows key={f.id} f={f} open={open === f.id} onToggle={() => setOpen(open === f.id ? null : f.id)} onOpenDeal={onOpenDeal}
                    canTriage={canRole(ctx?.role, 'triage')} canPropose={canRole(ctx?.role, 'propose')} onPref={s => setPref({ f, state: s })} onTask={() => setTask(f)} onRestore={async () => {
                      try { await api(`revenue/findings/${f.id}/preference`, { method: 'POST', body: { state: 'clear' } }); reload() } catch (e) { addToast(e instanceof ApiError ? e.message : 'Failed', 'error') }
                    }} />
                ))}
              </tbody>
            </table>
            <div className="rv-pager">
              <span className="rv-muted">{data.total} findings · {t('common.data_as_of')} {formatDate(data.snapshot?.as_of, ov.data?.snapshot?.timezone, true)}</span>
              <span>
                <button className="btn-sm btn-sm-ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>Previous</button>{' '}
                <button className="btn-sm btn-sm-ghost" disabled={data.next_offset === null} onClick={() => setOffset(data.next_offset ?? 0)}>Next</button>
              </span>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="view-header"><div><div className="view-subtitle">{t('doctor.subtitle')}</div><h1 className="display view-title">{t('doctor.title')}</h1></div></div>
      <div className="rv-filters" role="group" aria-label="Filters">
        {opts && sel('owner', 'Owner', [{ id: 'none', label: 'No owner' }, ...opts.owners])}
        {opts && sel('stage', 'Stage', opts.stages)}
        {opts && sel('pipeline', 'Pipeline', opts.pipelines)}
        {sel('category', 'Issue', CATEGORIES.map(c => ({ id: c, label: t(`cat.${c}`) })))}
        {sel('severity', 'Severity', ['high', 'medium', 'low', 'info'].map(s => ({ id: s, label: t(`sev.${s}`) })))}
        {sel('status', 'State', ['open', 'resolved', 'dismissed', 'snoozed'].map(s => ({ id: s, label: s })))}
        <label className="rv-filter"><span>Opened from</span><input className="form-input" type="date" value={filters.from ?? ''} onChange={e => set('from', e.target.value)} /></label>
        <label className="rv-filter"><span>Opened to</span><input className="form-input" type="date" value={filters.to ?? ''} onChange={e => set('to', e.target.value)} /></label>
      </div>
      {body}
      {pref && <PreferenceModal f={pref.f} state={pref.state} onClose={() => setPref(null)} onSaved={() => { setPref(null); reload(); addToast('Saved — evidence and score are unchanged') }} />}
      {task && <ProposeTaskModal dealId={task.deal_id} dealName={task.deal_name} defaultSubject={task.recommendation ?? ''} rationale={`${task.rule_key}: ${task.evidence.reason ?? ''}`} onClose={() => setTask(null)} onCreated={() => onNavigate('rv-actions')} addToast={addToast} />}
    </div>
  )
}

function FindingRows({ f, open, onToggle, onOpenDeal, canTriage, canPropose, onPref, onTask, onRestore }: {
  f: Finding; open: boolean; onToggle: () => void; onOpenDeal: (id: string) => void; canTriage: boolean; canPropose: boolean
  onPref: (s: 'dismissed' | 'snoozed') => void; onTask: () => void; onRestore: () => void
}) {
  return (
    <>
      <tr>
        <td><SeverityBadge s={f.severity} /></td>
        <td><button className="rv-link" onClick={() => onOpenDeal(f.deal_id)}>{f.deal_name ?? f.deal_id}</button></td>
        <td><button className="rv-link" aria-expanded={open} onClick={onToggle}>{t(`cat.${f.category}`)}</button>{f.preference && <Chip>{f.preference.state}</Chip>}</td>
        <td>{f.owner ?? '—'}</td><td>{formatMoney(f.amount, f.currency)}</td><td>{f.age_days}</td>
        <td className="rv-row-actions">
          {canPropose && <button className="btn-sm btn-sm-ghost" onClick={onTask}>{t('doctor.propose_task')}</button>}
          {canTriage && !f.preference && <><button className="btn-sm btn-sm-ghost" onClick={() => onPref('snoozed')}>{t('doctor.snooze')}</button><button className="btn-sm btn-sm-ghost" onClick={() => onPref('dismissed')}>{t('doctor.dismiss')}</button></>}
          {canTriage && f.preference && <button className="btn-sm btn-sm-ghost" onClick={onRestore}>Restore</button>}
        </td>
      </tr>
      {open && (
        <tr className="rv-detail-row"><td colSpan={7}>
          <div className="rv-evidence"><strong>Evidence</strong>
            <ul>
              {f.evidence.reason && <li>Reason: <code>{f.evidence.reason}</code></li>}
              {f.evidence.observed_value !== undefined && f.evidence.observed_value !== null && <li>Observed: {String(f.evidence.observed_value)}{f.evidence.threshold !== undefined && f.evidence.threshold !== null ? ` · threshold: ${String(f.evidence.threshold)}` : ''}</li>}
              {f.evidence.issues && <li>Missing: {f.evidence.issues.join(', ')}</li>}
              <li>First seen {formatDate(f.first_seen_at)} · stage {f.stage ?? '—'}</li>
              {f.preference && <li>{f.preference.state}: “{f.preference.reason}”{f.preference.until ? ` until ${formatDate(f.preference.until)}` : ''}</li>}
            </ul>
            {f.recommendation && <div><strong>Recommendation:</strong> {f.recommendation}</div>}
            {f.hubspot_url && <a className="rv-link" href={f.hubspot_url} target="_blank" rel="noopener noreferrer">{t('common.open_hubspot')} ↗</a>}
          </div>
        </td></tr>
      )}
    </>
  )
}

function PreferenceModal({ f, state, onClose, onSaved }: { f: Finding; state: 'dismissed' | 'snoozed'; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState('')
  const [until, setUntil] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10))
  const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    try { await api(`revenue/findings/${f.id}/preference`, { method: 'POST', body: { state, reason, until: state === 'snoozed' ? new Date(`${until}T23:59:59`).toISOString() : undefined } }); onSaved() }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed') }
  }
  return (
    <Modal title={`${state === 'dismissed' ? t('doctor.dismiss') : t('doctor.snooze')} — ${f.deal_name ?? ''}`} onClose={onClose}
      footer={<><button className="btn-sm btn-sm-ghost" onClick={onClose}>{t('common.cancel')}</button><button className="btn-sm btn-sm-primary" disabled={!reason.trim()} onClick={save}>{t('common.save')}</button></>}>
      <div className="form-group"><label className="form-label" htmlFor="pf-reason">{t('doctor.reason')}</label><textarea id="pf-reason" className="form-input" rows={3} value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></div>
      {state === 'snoozed' && <div className="form-group"><label className="form-label" htmlFor="pf-until">{t('doctor.until')}</label><input id="pf-until" type="date" className="form-input" value={until} onChange={e => setUntil(e.target.value)} /></div>}
      <p className="rv-muted">{t('doctor.note_hidden')}</p>
      {err && <div role="alert" className="rv-inline-error">{err}</div>}
    </Modal>
  )
}
