import { useApi } from '../../lib/revenue/useApi'
import { useRevenue, canRole } from '../../lib/revenue/RevenueContext'
import { t } from '../../lib/revenue/i18n'
import { formatDate, pct } from '../../lib/revenue/format'
import type { Overview } from '../../lib/revenue/types'
import { StateBox, Loading, ErrorBox, MoneyByCurrency, SeverityBadge, useSync } from '../../components/revenue/common'
import { Icon } from '../../components/ui/Icon'

export interface RevenueViewProps { active: boolean; addToast: (m: string, ty?: 'success' | 'error') => void; onNavigate: (v: string) => void; onOpenDeal: (id: string) => void }

export function CoverageBanner({ ov }: { ov: Overview }) {
  const reconnect = ov.connection?.status === 'reconnect_required'
  const partial = ov.snapshot?.status === 'partial' || (ov.last_sync?.warnings?.length ?? 0) > 0
  return (
    <>
      {reconnect && <div className="rv-banner" role="alert"><strong>{t('state.reconnect.title')}.</strong> {t('state.reconnect.desc')}</div>}
      {partial && <div className="rv-banner" role="status"><strong>{t('state.partial.title')}.</strong> {t('state.partial.desc')}{ov.last_sync?.warnings?.length ? ` (${ov.last_sync.warnings.join(', ')})` : ''}</div>}
    </>
  )
}

export default function OverviewView({ active, addToast, onNavigate, onOpenDeal }: RevenueViewProps) {
  const { ctx } = useRevenue()
  const { data, error, loading, reload } = useApi<Overview>('revenue/overview', {}, active)
  const sync = useSync(() => { reload(); addToast('Sync finished') })
  const role = ctx?.role

  const header = (
    <div className="view-header">
      <div><div className="view-subtitle">{t('group.revenue')}</div><h1 className="display view-title">{t('overview.title')}</h1></div>
      <div className="view-actions">
        {canRole(role, 'sync') && data?.connection?.status === 'active' && (
          <button className="btn-sm btn-sm-primary" disabled={sync.running} onClick={() => void sync.start(false)}>
            <Icon name="sync" size={12} /> {sync.running ? `${t('common.syncing')} ${sync.step ?? ''}` : t('common.run_sync')}
          </button>
        )}
      </div>
    </div>
  )

  let body
  if (!data && loading) body = <Loading />
  else if (error) body = <ErrorBox error={error} onRetry={reload} />
  else if (!data) body = null
  else if (!data.connection) {
    body = <StateBox icon="integrations" title={t('state.not_connected.title')} desc={t('state.not_connected.desc')}
      action={<button className="btn-sm btn-sm-primary" onClick={() => onNavigate('rv-settings')}>{t('nav.integrations')}</button>} />
  } else if (!data.snapshot || !data.kpis) {
    body = (
      <>
        {data.connection.status === 'reconnect_required' && <StateBox icon="warning" tone="warn" title={t('state.reconnect.title')} desc={t('state.reconnect.desc')} />}
        <StateBox icon="pipeline" title={t('state.no_snapshot.title')} desc={t('state.no_snapshot.desc')}
          action={<button className="btn-sm btn-sm-primary" onClick={() => onNavigate('rv-settings')}>{t('nav.integrations')}</button>} />
      </>
    )
  } else {
    const k = data.kpis
    body = (
      <>
        <CoverageBanner ov={data} />
        {sync.error && <ErrorBox error={sync.error} />}
        <div className="rv-asof">{t('common.data_as_of')} {formatDate(data.snapshot.as_of, data.snapshot.timezone, true)} · rules v{data.snapshot.rules_version}</div>
        <div className="rv-kpis">
          <section className="card rv-kpi" aria-label={t('overview.score')}>
            <div className="stat-label">{t('overview.score')}</div>
            <div className="rv-kpi-value">{k.revenue_score === null ? '—' : Math.round(k.revenue_score)}</div>
            <div className="rv-muted">{k.revenue_score === null ? t('overview.no_score') : `${k.eligible_deals} ${t('overview.eligible')} ${k.open_deals} ${t('overview.open_deals')}`}</div>
            <div className="rv-muted">{t('overview.coverage')}: {pct(k.average_coverage)}{k.exclusions.provisional ? ` · ${k.exclusions.provisional} provisional` : ''}{k.exclusions.not_evaluable ? ` · ${k.exclusions.not_evaluable} not evaluable` : ''}</div>
            <div className="rv-note">{t('overview.score.note')}</div>
          </section>
          <section className="card rv-kpi" aria-label={t('overview.pipeline')}>
            <div className="stat-label">{t('overview.pipeline')}</div>
            <MoneyByCurrency rows={k.by_currency} pick="open_pipeline" />
            {k.by_currency.some(c => c.unknown_amount_count > 0) && <div className="rv-muted">{k.by_currency.reduce((s, c) => s + c.unknown_amount_count, 0)} {t('overview.unknown_amounts')}</div>}
          </section>
          <section className="card rv-kpi" aria-label={t('overview.at_risk')}>
            <div className="stat-label">{t('overview.at_risk')}</div>
            <MoneyByCurrency rows={k.by_currency} pick="at_risk_amount" />
            {k.by_currency.some(c => c.provisional_at_risk_deal_count > 0) && (
              <div className="rv-muted">{t('overview.at_risk.provisional')}: {k.by_currency.filter(c => c.provisional_at_risk_deal_count > 0).map(c => `${c.provisional_at_risk_deal_count}${c.currency ? ` (${c.currency})` : ''}`).join(', ')}</div>
            )}
          </section>
          <section className="card rv-kpi" aria-label={t('overview.issues')}>
            <div className="stat-label">{t('overview.issues')}</div>
            <div className="rv-kpi-value">{k.findings_open}</div>
            <div className="rv-muted">{k.deals_with_findings} {t('doctor.unique_deals')}</div>
            <button className="card-action" onClick={() => onNavigate('rv-doctor')}>{t('nav.doctor')} →</button>
          </section>
        </div>
        <div className="rv-muted" style={{ margin: '4px 0 18px' }}>{t('overview.last_sync')}: {data.last_sync ? `${formatDate(data.last_sync.finished_at, undefined, true)} (${data.last_sync.status})` : '—'}</div>
        <section className="card">
          <div className="card-header"><div className="card-title">{t('overview.priorities')}</div></div>
          {(data.priorities ?? []).length === 0 ? <div className="rv-muted" style={{ padding: 16 }}>{t('doctor.empty')}</div> : (
            <ol className="rv-priorities">
              {(data.priorities ?? []).map(p => (
                <li key={p.finding_id}>
                  <SeverityBadge s={p.severity} /> <button className="rv-link" onClick={() => onOpenDeal(p.deal_id)}>{p.deal_name ?? p.deal_id}</button>
                  <span className="rv-muted"> — {t(`cat.${({ inactivity: 'inactivity', no_next_step: 'next_step', stalled_stage: 'stalled', overdue_close: 'close_date', single_contact: 'single_contact', missing_owner: 'owner' } as Record<string, string>)[p.rule_key] ?? 'data_quality'}`)}</span>
                  {p.recommendation && <div className="rv-muted">{p.recommendation}</div>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </>
    )
  }
  return <div className={`view ${active ? 'active' : ''}`}>{header}{body}</div>
}
