import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/revenue/api'
import { useApi } from '../../lib/revenue/useApi'
import { useRevenue, canRole } from '../../lib/revenue/RevenueContext'
import { t } from '../../lib/revenue/i18n'
import { formatDate, formatMoney, pct } from '../../lib/revenue/format'
import type { Brief, BriefRow, Source } from '../../lib/revenue/types'
import { StateBox, Loading, ErrorBox, SeverityBadge, MoneyByCurrency, Chip } from '../../components/revenue/common'
import type { RevenueViewProps } from './OverviewView'

export function SourceChips({ sources, ids, onOpenDeal }: { sources: Source[]; ids: string[]; onOpenDeal: (id: string) => void }) {
  return (
    <span className="rv-sources">
      {ids.map(id => {
        const s = sources.find(x => x.id === id)
        if (!s) return null
        return (
          <span key={id} className="rv-source">
            {s.deal_id ? <button className="rv-link" onClick={() => onOpenDeal(s.deal_id as string)}>{s.label}</button> : <span>{s.label}</span>}
            {s.hubspot_url && <a className="rv-link" href={s.hubspot_url} target="_blank" rel="noopener noreferrer" aria-label={`${t('common.open_hubspot')}: ${s.label}`}> ↗</a>}
          </span>
        )
      })}
    </span>
  )
}

export default function BriefView({ active, addToast, onNavigate, onOpenDeal }: RevenueViewProps) {
  const { ctx } = useRevenue()
  const list = useApi<{ items: BriefRow[] }>('revenue/briefs', {}, active)
  const [selected, setSelected] = useState<string | null>(null)
  const [period, setPeriod] = useState<'daily' | 'weekly'>('weekly')
  const [busy, setBusy] = useState(false)
  const first = list.data?.items[0]?.id
  useEffect(() => { if (!selected && first) setSelected(first) }, [first, selected])
  const brief = useApi<Brief>(selected ? `revenue/briefs/${selected}` : null, {}, active && !!selected)

  const generate = async () => {
    setBusy(true)
    try {
      await api('revenue/briefs', { method: 'POST', body: { period } })
      for (let i = 0; i < 10; i++) { const k = await api<{ processed: number }>('revenue/worker/kick', { method: 'POST', body: {} }).catch(() => ({ processed: 0 })); if (!k.processed) break }
      list.reload(); setSelected(null); addToast('Brief ready')
    } catch (e) { addToast(e instanceof ApiError ? (e.code === 'no_data' ? 'Run a sync first — there is no analysis yet' : e.message) : 'Failed', 'error') } finally { setBusy(false) }
  }

  const c = brief.data?.content
  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="view-header"><div><div className="view-subtitle">{t('group.revenue')}</div><h1 className="display view-title">{t('brief.title')}</h1></div>
        {canRole(ctx?.role, 'propose') && <div className="view-actions">
          <label className="rv-sr" htmlFor="brief-period">Period</label>
          <select id="brief-period" className="form-input" value={period} onChange={e => setPeriod(e.target.value as 'daily' | 'weekly')}><option value="weekly">Weekly</option><option value="daily">Daily</option></select>
          <button className="btn-sm btn-sm-primary" disabled={busy} onClick={generate}>{busy ? t('common.loading') : t('brief.generate')}</button>
        </div>}
      </div>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
      {list.data && list.data.items.length === 0 && <StateBox icon="openBook" title={t('brief.empty')} action={<button className="btn-sm btn-sm-ghost" onClick={() => onNavigate('rv-settings')}>{t('nav.integrations')}</button>} />}
      {list.data && list.data.items.length > 0 && (
        <div className="rv-split">
          <nav className="card rv-briefs-list" aria-label="Briefs">
            {list.data.items.map(b => <button key={b.id} className={`rv-brief-item ${selected === b.id ? 'is-selected' : ''}`} onClick={() => setSelected(b.id)}>{formatDate(b.period_end)} · {b.period}{b.is_baseline ? ' · baseline' : ''}</button>)}
          </nav>
          <article className="card rv-brief">
            {brief.loading && !brief.data && <Loading />}
            {brief.error && <ErrorBox error={brief.error} onRetry={brief.reload} />}
            {c && (
              <>
                <div className="rv-asof">{t('common.data_as_of')} {formatDate(c.as_of, undefined, true)}</div>
                {c.narrative ? <><h2 className="rv-h2">{c.narrative.headline}</h2><p>{c.narrative.summary}</p>
                  {c.narrative.priorities.length > 0 && <ol className="rv-list">{c.narrative.priorities.map((p, i) => <li key={i}>{p.text} <SourceChips sources={c.sources} ids={p.evidence_ids} onOpenDeal={onOpenDeal} /></li>)}</ol>}</>
                  : <div className="rv-note">{t('brief.ai_off')}{c.ai.reason ? ` (${t(`ask.reason.${c.ai.reason}`) })` : c.ai.status === 'rejected_unverified' ? ' — the generated text could not be verified against your data' : ''}. The figures below are computed deterministically.</div>}
                {!c.comparison.available && <div className="rv-note">{c.comparison.reason === 'rules_changed' || c.comparison.reason === 'rules_version_changed' ? t('brief.rules_changed') : t('brief.baseline')}</div>}
                <h3 className="rv-h3">Metrics</h3>
                <div className="rv-facts"><div><span>{t('overview.score')}</span>{c.metrics.revenue_score === null ? '—' : Math.round(c.metrics.revenue_score)}</div>
                  <div><span>Eligible / open</span>{c.metrics.eligible_deals} / {c.metrics.open_deals}</div><div><span>{t('overview.coverage')}</span>{pct(c.metrics.average_coverage)}</div>
                  <div><span>{t('overview.pipeline')}</span><MoneyByCurrency rows={c.metrics.by_currency} pick="open_pipeline" /></div>
                  <div><span>{t('overview.at_risk')}</span><MoneyByCurrency rows={c.metrics.by_currency} pick="at_risk_amount" /></div><div><span>{t('overview.issues')}</span>{c.metrics.open_findings}</div></div>
                {c.changes && <><h3 className="rv-h3">{t('brief.changes')}</h3><ul className="rv-list"><li>Score: {c.changes.score_delta === null ? '—' : `${c.changes.score_delta > 0 ? '+' : ''}${c.changes.score_delta}`}</li><li>Open issues: {c.changes.open_findings_delta > 0 ? '+' : ''}{c.changes.open_findings_delta} (vs {formatDate(c.changes.previous_as_of)})</li></ul></>}
                <h3 className="rv-h3">{t('brief.risks')}</h3>
                {c.top_risks.length === 0 ? <div className="rv-muted">None.</div> : <ul className="rv-list">{c.top_risks.map(r => <li key={r.evidence_id}><SeverityBadge s={r.severity} /> <button className="rv-link" onClick={() => onOpenDeal(r.deal_id)}>{r.deal_name}</button> — {r.rule} · {formatMoney(r.amount, r.currency)}</li>)}</ul>}
                <h3 className="rv-h3">{t('brief.actions')}</h3>
                {c.actions.length === 0 ? <div className="rv-muted">None.</div> : <ul className="rv-list">{c.actions.map(a => <li key={a.evidence_id}>{a.text} <Chip>{a.deal_name}</Chip></li>)}</ul>}
                <h3 className="rv-h3">{t('brief.sources')}</h3>
                <SourceChips sources={c.sources} ids={c.sources.map(s => s.id)} onOpenDeal={onOpenDeal} />
              </>
            )}
          </article>
        </div>
      )}
    </div>
  )
}
