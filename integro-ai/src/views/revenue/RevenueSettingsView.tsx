import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../../lib/revenue/api'
import { useApi } from '../../lib/revenue/useApi'
import { useRevenue, canRole } from '../../lib/revenue/RevenueContext'
import { t } from '../../lib/revenue/i18n'
import { formatDate } from '../../lib/revenue/format'
import type { ConnectionStatus, Onboarding } from '../../lib/revenue/types'
import { StateBox, Loading, ErrorBox, Modal, useSync, Chip } from '../../components/revenue/common'
import type { RevenueViewProps } from './OverviewView'

const CONNECT_ERRORS: Record<string, string> = {
  denied: 'You cancelled the HubSpot authorization.', invalid_state: 'That authorization link expired or was already used. Start the connection again.',
  portal_in_use: 'That HubSpot account is already connected to another Integro organization.', portal_mismatch: 'This organization is already connected to a different HubSpot account. Disconnect it first.',
  missing_scopes: 'HubSpot did not grant the read permissions Integro needs.', forbidden: 'Only organization admins can connect HubSpot.', not_configured: t('settings.not_configured'),
  code_rejected: 'HubSpot rejected the authorization code. Try again.', exchange_failed: 'Could not complete the HubSpot connection. Try again.',
}

const TIMEZONES: string[] = (() => { try { return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone') } catch { return ['UTC'] } })()

export default function RevenueSettingsView({ active, addToast }: RevenueViewProps) {
  const { ctx, reload: reloadCtx } = useRevenue()
  const isAdmin = canRole(ctx?.role, 'admin')
  const status = useApi<ConnectionStatus>('integrations/hubspot/status', {}, active)
  const onb = useApi<Onboarding>('revenue/onboarding', {}, active && !!ctx?.flags.revenue_mvp_enabled)
  const [busy, setBusy] = useState(false)
  const [confirmDisc, setConfirmDisc] = useState(false)
  const sync = useSync(() => { status.reload(); onb.reload(); addToast('Sync finished') })

  // result of the OAuth round-trip arrives as ?hubspot=connected|error&reason=...
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const r = p.get('hubspot')
    if (!r) return
    if (r === 'connected') addToast('HubSpot connected'); else addToast(CONNECT_ERRORS[p.get('reason') ?? ''] ?? 'HubSpot connection failed', 'error')
    window.history.replaceState(null, '', window.location.pathname)
  }, [addToast])

  const connect = async () => {
    setBusy(true)
    try { const r = await api<{ authorize_url: string }>('integrations/hubspot/connect', { method: 'POST', body: { redirect_to: '/' } }); window.location.assign(r.authorize_url) }
    catch (e) { addToast(e instanceof ApiError ? e.message : 'Failed', 'error'); setBusy(false) }
  }
  const disconnect = async () => {
    try {
      const r = await api<{ note: string }>('integrations/hubspot/disconnect', { method: 'POST', body: { confirm: true } })
      addToast(r.note); setConfirmDisc(false); status.reload(); onb.reload()
    } catch (e) { addToast(e instanceof ApiError ? e.message : 'Failed', 'error') }
  }

  const s = status.data
  const conn = s?.connection
  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="view-header"><div><div className="view-subtitle">{t('group.revenue')}</div><h1 className="display view-title">{t('settings.title')}</h1></div></div>
      {status.loading && !s && <Loading />}
      {status.error && <ErrorBox error={status.error} onRetry={status.reload} />}
      {ctx && !ctx.flags.revenue_mvp_enabled && <StateBox icon="info" title={t('state.not_enabled.title')} desc={t('state.not_enabled.desc')} />}

      {s && ctx?.flags.revenue_mvp_enabled && (
        <>
          <section className="card rv-step" aria-labelledby="st-connect">
            <h2 id="st-connect" className="rv-h2">{t('settings.step.connect')}</h2>
            {!s.oauth_configured && <div className="rv-inline-error">{t('settings.not_configured')}</div>}
            {conn ? (
              <>
                <div className="rv-row"><span className={`rv-badge ${conn.status === 'active' ? 'rv-band-healthy' : 'rv-band-high_risk'}`}>{conn.status === 'active' ? t('settings.connected') : t('state.reconnect.title')}</span>
                  <span>Portal <code>{conn.portal_id}</code></span><span className="rv-muted">since {formatDate(conn.connected_at)} · last success {formatDate(conn.last_success_at, undefined, true)}</span></div>
                <div className="rv-row"><Chip>read deals: {conn.capabilities.read ? 'yes' : 'no'}</Chip><Chip>create tasks: {conn.capabilities.write_tasks ? 'yes' : 'no'}</Chip><Chip>update deals: {conn.capabilities.write_deals ? 'yes' : 'no'}</Chip></div>
                {conn.coverage && <div className="rv-muted">Coverage — activities: {conn.coverage.activities}, stage history: {conn.coverage.stage_history}, associations: {conn.coverage.associations_contacts}</div>}
                {s.last_sync?.warnings?.length ? <div className="rv-note">{t('state.partial.desc')} ({s.last_sync.warnings.join(', ')})</div> : null}
                <div className="rv-note">{t('settings.write_note')}</div>
                {isAdmin && <div className="rv-row"><button className="btn-sm btn-sm-ghost" disabled={busy || !s.oauth_configured} onClick={connect}>{conn.status === 'active' ? 'Re-authorize / grant write access' : t('settings.reconnect')}</button>
                  <button className="btn-sm btn-sm-ghost" onClick={() => setConfirmDisc(true)}>{t('settings.disconnect')}</button></div>}
              </>
            ) : (
              <>
                <p className="rv-muted">{t('state.not_connected.desc')}</p>
                {isAdmin ? <button className="btn-sm btn-sm-primary" disabled={busy || !s.oauth_configured} onClick={connect}>{t('settings.connect')}</button> : <div className="rv-muted">Only organization admins can connect HubSpot.</div>}
              </>
            )}
          </section>

          {conn?.status === 'active' && (
            <>
              <section className="card rv-step" aria-labelledby="st-sync">
                <h2 id="st-sync" className="rv-h2">{t('settings.step.sync')}</h2>
                <div className="rv-row">
                  {canRole(ctx.role, 'sync') ? <button className="btn-sm btn-sm-primary" disabled={sync.running} onClick={() => void sync.start(!s.last_sync)}>{sync.running ? `${t('common.syncing')} ${sync.step ?? ''}` : (s.last_sync ? t('common.run_sync') : 'Load pipelines from HubSpot')}</button> : <span className="rv-muted">{t('common.no_permission')}</span>}
                  {s.last_sync && <span className="rv-muted">Last: {s.last_sync.status} · {formatDate(s.last_sync.finished_at, undefined, true)}</span>}
                </div>
                {sync.running && <div className="rv-progress" role="status" aria-live="polite">Step: <strong>{sync.step ?? '…'}</strong> {Object.entries(sync.counters).map(([k, v]) => <Chip key={k}>{k}: {v}</Chip>)}</div>}
                {sync.error && <ErrorBox error={sync.error} />}
                {!sync.running && s.last_sync?.counters && Object.keys(s.last_sync.counters).length > 0 && <div className="rv-muted">{Object.entries(s.last_sync.counters).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>}
              </section>
              {onb.error && <ErrorBox error={onb.error} onRetry={onb.reload} />}
              {onb.data && <OnboardingForm ob={onb.data} isAdmin={isAdmin} onSaved={() => { onb.reload(); reloadCtx() }} addToast={addToast} />}
              {isAdmin && <RulesForm currency={onb.data?.settings.currency ?? 'USD'} addToast={addToast} />}
            </>
          )}

          <section className="card rv-step" aria-labelledby="st-ai">
            <h2 id="st-ai" className="rv-h2">{t('settings.step.ai')}</h2>
            <div className="rv-row"><Chip>Managed AI: {ctx.flags.managed_ai_enabled ? (ctx.ai_configured ? 'on' : 'enabled, not configured on server') : 'off'}</Chip><Chip>HubSpot write actions: {ctx.flags.hubspot_write_actions_enabled ? 'on' : 'off'}</Chip></div>
            <p className="rv-muted">Integro provides the AI. There are no customer API keys or model choices. Diagnostics work without AI. These switches are controlled by Integro during rollout.</p>
          </section>
        </>
      )}
      {confirmDisc && <Modal title={t('settings.disconnect')} onClose={() => setConfirmDisc(false)} footer={<><button className="btn-sm btn-sm-ghost" onClick={() => setConfirmDisc(false)}>{t('common.cancel')}</button><button className="btn-sm btn-sm-primary" onClick={disconnect}>{t('settings.disconnect')}</button></>}>
        <p>Syncing stops, pending actions are cancelled and the HubSpot tokens are revoked and deleted. Your synced history is kept per the retention policy. Changes already written to HubSpot are not undone.</p></Modal>}
    </div>
  )
}

function OnboardingForm({ ob, isAdmin, onSaved, addToast }: { ob: Onboarding; isAdmin: boolean; onSaved: () => void; addToast: RevenueViewProps['addToast'] }) {
  const [selected, setSelected] = useState<string[]>(ob.settings.selected_pipeline_ids)
  const [cats, setCats] = useState<Record<string, string>>({})
  const [tz, setTz] = useState(ob.settings.timezone)
  const [currency, setCurrency] = useState(ob.settings.currency ?? '')
  const [confirm, setConfirm] = useState(ob.state === 'confirmed' || ob.state === 'synced')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setSelected(ob.settings.selected_pipeline_ids); setTz(ob.settings.timezone); setCurrency(ob.settings.currency ?? '') }, [ob])
  const shown = useMemo(() => ob.pipelines.filter(p => selected.includes(p.external_id)), [ob, selected])
  const catOf = (st: { external_id: string; category: string; suggested_category: string | null }) => cats[st.external_id] ?? (st.category !== 'unmapped' ? st.category : '')

  const save = async () => {
    setBusy(true)
    try {
      const stage_categories = Object.fromEntries(Object.entries(cats).filter(([, v]) => v))
      await api('revenue/onboarding', { method: 'POST', body: { selected_pipeline_ids: selected, ...(Object.keys(stage_categories).length ? { stage_categories } : {}), timezone: tz, ...(currency ? { currency } : {}), confirm } })
      addToast('Saved'); setCats({}); onSaved()
    } catch (e) { addToast(e instanceof ApiError ? e.message : 'Failed', 'error') } finally { setBusy(false) }
  }
  if (ob.pipelines.length === 0) return <StateBox icon="pipeline" title="No pipelines loaded yet" desc="Run the first sync to read your HubSpot pipelines and stages." />
  return (
    <section className="card rv-step" aria-labelledby="st-pipe">
      <h2 id="st-pipe" className="rv-h2">{t('settings.step.pipeline')}</h2>
      <fieldset className="rv-fieldset" disabled={!isAdmin}><legend>Pipelines to analyze</legend>
        {ob.pipelines.map(p => (
          <label key={p.external_id} className="rv-check"><input type="checkbox" checked={selected.includes(p.external_id)} onChange={e => setSelected(s => e.target.checked ? [...s, p.external_id] : s.filter(x => x !== p.external_id))} /> {p.label}</label>
        ))}
      </fieldset>
      {shown.map(p => (
        <div key={p.external_id}>
          <h3 className="rv-h3">{p.label}</h3><p className="rv-muted">{t('settings.stage_note')}</p>
          <table className="data-table"><caption className="rv-sr">Stages of {p.label}</caption><thead><tr><th scope="col">Stage</th><th scope="col">Category</th></tr></thead>
            <tbody>{p.stages.map(st => (
              <tr key={st.external_id}><td>{st.label}</td><td>{st.is_closed === true ? <Chip>closed (from HubSpot)</Chip> : (
                <>
                  <label className="rv-sr" htmlFor={`cat-${st.external_id}`}>Category for {st.label}</label>
                  <select id={`cat-${st.external_id}`} className="form-input" disabled={!isAdmin} value={catOf(st)} onChange={e => setCats(c => ({ ...c, [st.external_id]: e.target.value }))}>
                    <option value="">{st.suggested_category ? `Choose… (suggested: ${st.suggested_category})` : 'Choose…'}</option><option value="early">early</option><option value="mid">mid</option><option value="late">late</option>
                  </select></>)}</td></tr>))}</tbody></table>
        </div>
      ))}
      <h2 className="rv-h2" style={{ marginTop: 18 }}>{t('settings.step.confirm')}</h2>
      <div className="rv-row">
        <div className="form-group"><label className="form-label" htmlFor="tz">Time zone</label><select id="tz" className="form-input" disabled={!isAdmin} value={tz} onChange={e => setTz(e.target.value)}>{[...new Set([tz, ...TIMEZONES])].map(z => <option key={z}>{z}</option>)}</select></div>
        <div className="form-group"><label className="form-label" htmlFor="cur">Home currency (ISO)</label><input id="cur" className="form-input" maxLength={3} disabled={!isAdmin} value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} placeholder="USD" /></div>
      </div>
      <label className="rv-check"><input type="checkbox" disabled={!isAdmin} checked={confirm} onChange={e => setConfirm(e.target.checked)} /> I confirm the pipeline, stage categories, currency and time zone above.</label>
      {isAdmin ? <div><button className="btn-sm btn-sm-primary" disabled={busy || selected.length === 0} onClick={save}>{t('common.save')}</button> <span className="rv-muted">State: {ob.state}</span></div> : <div className="rv-muted">Only admins can change onboarding settings.</div>}
    </section>
  )
}

function RulesForm({ currency, addToast }: { currency: string; addToast: RevenueViewProps['addToast'] }) {
  const [days, setDays] = useState('14')
  const [mult, setMult] = useState('1.5')
  const [amount, setAmount] = useState('20000')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      const r = await api<{ version: number; note: string }>('revenue/rules', { method: 'POST', body: { thresholds: { inactivity_days: Number(days), stalled_multiplier: Number(mult), single_contact_min_amount: { [currency]: amount } } } })
      addToast(`Rules v${r.version} published. ${r.note}`)
    } catch (e) { addToast(e instanceof ApiError ? e.message : 'Failed', 'error') } finally { setBusy(false) }
  }
  return (
    <section className="card rv-step" aria-labelledby="st-rules">
      <h2 id="st-rules" className="rv-h2">{t('settings.step.rules')}</h2>
      <p className="rv-muted">Starting points, not validated benchmarks. Publishing creates a new immutable version and re-evaluates; snapshots from different versions are not directly comparable.</p>
      <div className="rv-row">
        <div className="form-group"><label className="form-label" htmlFor="r-days">Inactivity threshold (days)</label><input id="r-days" className="form-input" type="number" min={1} value={days} onChange={e => setDays(e.target.value)} /></div>
        <div className="form-group"><label className="form-label" htmlFor="r-mult">Stalled-stage multiplier (× median)</label><input id="r-mult" className="form-input" type="number" step="0.1" min={1} value={mult} onChange={e => setMult(e.target.value)} /></div>
        <div className="form-group"><label className="form-label" htmlFor="r-amt">Single-contact minimum amount ({currency})</label><input id="r-amt" className="form-input" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></div>
      </div>
      <button className="btn-sm btn-sm-primary" disabled={busy} onClick={save}>Publish new rules version</button>
    </section>
  )
}
