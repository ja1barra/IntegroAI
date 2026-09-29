import { useEffect, useRef, useState } from 'react'
import { useApi } from '../../lib/revenue/useApi'
import { useRevenue, canRole } from '../../lib/revenue/RevenueContext'
import { t } from '../../lib/revenue/i18n'
import { formatMoney, formatDate, formatCloseDate, pct } from '../../lib/revenue/format'
import type { DealsResponse, DealDetail } from '../../lib/revenue/types'
import { StateBox, Loading, ErrorBox, HealthBadge, SeverityBadge, ProposeTaskModal, Chip } from '../../components/revenue/common'
import type { RevenueViewProps } from './OverviewView'

export default function DealsView({ active, addToast, onNavigate, selectedDealId, onSelectDeal }: RevenueViewProps & { selectedDealId: string | null; onSelectDeal: (id: string | null) => void }) {
  const [q, setQ] = useState('')
  const [offset, setOffset] = useState(0)
  const [sort, setSort] = useState<'health' | 'amount'>('health')
  const { data, error, loading, reload } = useApi<DealsResponse>('revenue/deals', { q, offset, sort }, active)

  let body
  if (!data && loading) body = <Loading />
  else if (error) body = <ErrorBox error={error} onRetry={reload} />
  else if (data && !data.snapshot) body = <StateBox icon="pipeline" title={t('state.no_snapshot.title')} desc={t('state.no_snapshot.desc')} action={<button className="btn-sm btn-sm-primary" onClick={() => onNavigate('rv-settings')}>{t('nav.integrations')}</button>} />
  else if (data && data.items.length === 0) body = <StateBox icon="pipeline" title={t('deals.empty')} />
  else if (data) body = (
    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
      <table className="data-table">
        <caption className="rv-sr">{t('deals.title')}</caption>
        <thead><tr><th scope="col">Deal</th><th scope="col">Company</th><th scope="col">Owner</th><th scope="col">Amount</th><th scope="col">Stage</th><th scope="col">Close</th><th scope="col">Last activity</th><th scope="col">{t('deals.health')}</th><th scope="col">{t('deals.coverage')}</th></tr></thead>
        <tbody>
          {data.items.map(d => (
            <tr key={d.id}>
              <td><button className="rv-link" onClick={() => onSelectDeal(d.id)}>{d.name ?? d.id}</button></td>
              <td>{d.company ?? '—'}</td><td>{d.owner ?? <Chip>no owner</Chip>}</td><td>{formatMoney(d.amount, d.currency)}</td><td>{d.stage ?? '—'}</td>
              <td>{formatCloseDate(d.close_at)}</td><td>{d.days_since_activity === null ? t('common.unknown') : `${Math.floor(d.days_since_activity)} d`}</td>
              <td><HealthBadge band={d.band} health={d.health} /></td><td>{pct(d.coverage)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rv-pager"><span className="rv-muted">{data.total} deals · {t('common.data_as_of')} {formatDate(data.snapshot?.as_of, undefined, true)}</span>
        <span><button className="btn-sm btn-sm-ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>Previous</button>{' '}
          <button className="btn-sm btn-sm-ghost" disabled={data.next_offset === null} onClick={() => setOffset(data.next_offset ?? 0)}>Next</button></span></div>
    </div>
  )

  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="view-header"><div><div className="view-subtitle">{t('group.revenue')}</div><h1 className="display view-title">{t('deals.title')}</h1></div>
        <div className="view-actions">
          <label className="rv-sr" htmlFor="deal-search">{t('deals.search')}</label>
          <input id="deal-search" className="form-input" style={{ width: 220 }} placeholder={t('deals.search')} value={q} onChange={e => { setOffset(0); setQ(e.target.value) }} />
          <select className="form-input" aria-label="Sort" value={sort} onChange={e => setSort(e.target.value as 'health' | 'amount')}><option value="health">Worst health first</option><option value="amount">Largest amount first</option></select>
        </div>
      </div>
      {body}
      {selectedDealId && <DealDrawer id={selectedDealId} onClose={() => onSelectDeal(null)} addToast={addToast} onNavigate={onNavigate} />}
    </div>
  )
}

function DealDrawer({ id, onClose, addToast, onNavigate }: { id: string; onClose: () => void; addToast: RevenueViewProps['addToast']; onNavigate: (v: string) => void }) {
  const { ctx } = useRevenue()
  const { data, error, loading, reload } = useApi<DealDetail>(`revenue/deals/${id}`, {}, true)
  const [task, setTask] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); prev?.focus() }
  }, [onClose])
  const d = data?.deal

  return (
    <div className="rv-drawer-scrim" onClick={onClose}>
      <aside className="rv-drawer" role="dialog" aria-modal="true" aria-label="Deal details" tabIndex={-1} ref={ref} onClick={e => e.stopPropagation()}>
        <div className="rv-drawer-head"><h2 className="display" style={{ fontSize: 26 }}>{d?.name ?? '…'}</h2><button className="modal-close" onClick={onClose} aria-label={t('common.close')}>×</button></div>
        {loading && !data && <Loading />}
        {error && <ErrorBox error={error} onRetry={reload} />}
        {data && d && (
          <div className="rv-drawer-body">
            <div className="rv-facts">
              <div><span>Amount</span>{formatMoney(d.amount, d.currency)}</div><div><span>Stage</span>{d.stage ?? '—'}{d.stage_category ? ` (${d.stage_category})` : ''}</div>
              <div><span>Owner</span>{d.owner ?? 'No owner'}</div><div><span>Company</span>{d.company ?? '—'}</div>
              <div><span>Close date</span>{formatCloseDate(d.close_at)}</div><div><span>In stage since</span>{d.stage_entered_at ? `${formatDate(d.stage_entered_at)} (${d.stage_entered_source})` : t('common.unknown')}</div>
            </div>
            <div className="rv-row">
              {data.evaluation && <HealthBadge band={data.evaluation.band} health={data.evaluation.health} />}
              {d.hubspot_url && <a className="rv-link" href={d.hubspot_url} target="_blank" rel="noopener noreferrer">{t('common.open_hubspot')} ↗</a>}
              {canRole(ctx?.role, 'propose') && <button className="btn-sm btn-sm-ghost" onClick={() => setTask(true)}>{t('doctor.propose_task')}</button>}
            </div>
            {data.evaluation && (
              <section><h3 className="rv-h3">Score factors <span className="rv-muted">· coverage {pct(data.evaluation.coverage)} · {t('common.data_as_of')} {formatDate(data.evaluation.as_of, undefined, true)}</span></h3>
                {data.evaluation.provisional && <div className="rv-note">Provisional: too many rules are unknown, so this deal is excluded from the Revenue Score.</div>}
                <table className="data-table"><thead><tr><th scope="col">Rule</th><th scope="col">Status</th><th scope="col">Penalty</th><th scope="col">Observed / threshold</th></tr></thead>
                  <tbody>{data.evaluation.factors.map(f => (
                    <tr key={f.rule_key}><td>{f.rule_key}</td><td><span className={`rv-badge rv-rule-${f.status}`}>{f.status.replace('_', ' ')}</span></td><td>{f.penalty ? `−${f.penalty}` : '0'}</td>
                      <td>{f.observed_value !== null && f.observed_value !== undefined ? String(f.observed_value) : '—'}{f.threshold !== null && f.threshold !== undefined ? ` / ${String(f.threshold)}` : ''} <span className="rv-muted">{f.reason}</span></td></tr>
                  ))}</tbody></table>
              </section>
            )}
            {data.unknown_data.length > 0 && <section><h3 className="rv-h3">Unknown data</h3><ul className="rv-list">{data.unknown_data.map(u => <li key={u.rule_key}><code>{u.rule_key}</code>: {u.reason}</li>)}</ul></section>}
            {data.findings.length > 0 && <section><h3 className="rv-h3">Findings</h3><ul className="rv-list">{data.findings.map(f => <li key={f.id}><SeverityBadge s={f.severity} /> {t(`cat.${f.category}`)} — {f.status}{f.suppressed ? ' (hidden by user)' : ''}</li>)}</ul></section>}
            <section><h3 className="rv-h3">Associations</h3>
              <div className="rv-muted">Company: {data.associations.company ?? '—'}</div>
              <ul className="rv-list">{data.associations.contacts.length ? data.associations.contacts.map((c, i) => <li key={i}>{c.name}{c.title ? ` · ${c.title}` : ''}</li>) : <li>No contacts associated (as of last sync)</li>}</ul></section>
            <section><h3 className="rv-h3">Timeline</h3>
              {data.timeline.length === 0 ? <div className="rv-muted">No activity synced for this deal.</div> : <ul className="rv-list">{data.timeline.map(a => <li key={a.id}><Chip>{a.type}</Chip> {formatDate(a.occurred_at ?? a.due_at, undefined, true)}{a.status ? ` · ${a.status}` : ''}{a.subject ? ` — ${a.subject}` : ''}</li>)}</ul>}
              {data.stage_history.length > 0 && <div className="rv-muted">Stage changes: {data.stage_history.slice(0, 5).map(h => `${h.value} (${formatDate(h.effective_at)})`).join(' → ')}</div>}
            </section>
            {data.proposals.length > 0 && <section><h3 className="rv-h3">Actions</h3><ul className="rv-list">{data.proposals.map(p => <li key={p.id}>{t(`kind.${p.kind}`)} — {t(`status.${p.status}`)} <button className="rv-link" onClick={() => { onClose(); onNavigate('rv-actions') }}>open</button></li>)}</ul></section>}
          </div>
        )}
        {task && d && <ProposeTaskModal dealId={id} dealName={d.name} onClose={() => setTask(false)} onCreated={reload} addToast={addToast} />}
      </aside>
    </div>
  )
}
