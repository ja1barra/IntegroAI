import { useState, useEffect, useCallback } from 'react'
import type { Integration, HubSpotContact, HubSpotDeal, ApolloContact, SlackChannel } from '../../lib/integrations/types'
import {
  MOCK_HUBSPOT_CONTACTS, MOCK_HUBSPOT_DEALS,
  MOCK_APOLLO_CONTACTS, MOCK_SLACK_CHANNELS,
  MOCK_SYNC_EVENTS, OAUTH_SCOPES, AGENT_DATA_TAGS,
} from '../../lib/integrations/mock'

type Tab = 'overview' | 'livedata' | 'synclog' | 'permissions' | 'agentmapping'

interface Props {
  integration: Integration
  onClose: () => void
  onDisconnect: () => void
  onConfigChange: (config: Integration['config']) => void
  addToast: (msg: string, type?: 'success' | 'error') => void
}

function formatTimeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const EVENT_ICON: Record<string, string> = {
  sync_complete: '✓',
  sync_failed: '✗',
  webhook_received: '↓',
  rate_limit: '⚠',
}
const EVENT_COLOR: Record<string, string> = {
  sync_complete: '#2a7d4f',
  sync_failed: '#c0392b',
  webhook_received: '#1a6fa8',
  rate_limit: '#8a5000',
}

const STATS: Record<string, Array<{ label: string; value: string; unit?: string }>> = {
  hubspot: [
    { label: 'Total Contacts', value: '1,247' },
    { label: 'Open Deals', value: '89' },
    { label: 'Pipeline Value', value: '$276', unit: 'K' },
    { label: 'API Calls Today', value: '234', unit: '/10K' },
  ],
  apollo: [
    { label: 'Prospects', value: '8,432' },
    { label: 'Credits Used', value: '1,240', unit: '/10K' },
    { label: 'Sequences Active', value: '12' },
    { label: 'Replies Today', value: '48' },
  ],
  slack: [
    { label: 'Channels Active', value: '3' },
    { label: 'Members Reached', value: '24' },
    { label: 'Messages Sent', value: '156' },
    { label: 'Alerts Today', value: '12' },
  ],
  klaviyo: [
    { label: 'Lists', value: '--' },
    { label: 'Subscribers', value: '--' },
    { label: 'Campaigns', value: '--' },
    { label: 'Last Sync', value: '--' },
  ],
}

interface LiveData {
  contacts?: HubSpotContact[]
  deals?: HubSpotDeal[]
  prospects?: ApolloContact[]
  channels?: SlackChannel[]
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 38, height: 22, borderRadius: 11, cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
        background: enabled ? 'var(--orange)' : 'rgba(122,114,104,0.2)',
        border: `1px solid ${enabled ? 'rgba(212,80,26,0.4)' : 'rgba(122,114,104,0.25)'}`,
        position: 'relative',
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: enabled ? 18 : 2, width: 16, height: 16,
        borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 4px rgba(26,23,20,0.18)',
        transition: 'left 0.2s',
      }} />
    </div>
  )
}

const AGENTS = [
  { key: 'outbound' as const, num: '01', name: 'Outbound Sales Machine', color: '#3ecf8e' },
  { key: 'demandGen' as const, num: '02', name: 'Demand Generation', color: '#f5a623' },
  { key: 'customerSuccess' as const, num: '03', name: 'Customer Success Engine', color: '#4d9de0' },
  { key: 'revenueIntelligence' as const, num: '04', name: 'Revenue Intelligence', color: '#9b59b6' },
]

const AUTH_TYPE_LABEL: Record<string, string> = {
  api_key: 'API Key',
  oauth: 'OAuth 2.0',
  private_app_token: 'Private App Token',
}

export default function DetailPanel({ integration, onClose, onDisconnect, onConfigChange, addToast }: Props) {
  const [tab, setTab] = useState<Tab>('overview')
  const [liveData, setLiveData] = useState<LiveData | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [config, setConfig] = useState(integration.config)
  const [keyInput, setKeyInput] = useState('••••••••••••••••')
  const [testingKey, setTestingKey] = useState(false)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setConfig(integration.config)
    setTab('overview')
    setLiveData(null)
    setLiveError(null)
    setKeyInput('••••••••••••••••')
    setTestMsg(null)
  }, [integration.id])

  const loadLiveData = useCallback(async () => {
    if (integration.status === 'error') { setLiveError('Authentication expired. Reconnect to view live data.'); return }
    setLiveLoading(true)
    setLiveError(null)
    await new Promise(r => setTimeout(r, 700))
    try {
      if (integration.provider === 'hubspot') setLiveData({ contacts: MOCK_HUBSPOT_CONTACTS, deals: MOCK_HUBSPOT_DEALS })
      else if (integration.provider === 'apollo') setLiveData({ prospects: MOCK_APOLLO_CONTACTS })
      else if (integration.provider === 'slack') setLiveData({ channels: MOCK_SLACK_CHANNELS })
      else setLiveError('Live data not available for this integration.')
    } finally {
      setLiveLoading(false)
    }
  }, [integration.id, integration.provider, integration.status])

  useEffect(() => {
    if (tab === 'livedata' && !liveData && !liveLoading) loadLiveData()
  }, [tab, liveData, liveLoading, loadLiveData])

  const updateConfig = (patch: Partial<Integration['config']>) => {
    const next = { ...config, ...patch }
    setConfig(next)
    onConfigChange(next)
  }

  const handleTestKey = async () => {
    setTestingKey(true)
    setTestMsg(null)
    await new Promise(r => setTimeout(r, 900))
    setTestMsg({ ok: true, text: 'Connection active — credentials valid' })
    setTestingKey(false)
  }

  const copyWebhook = () => {
    const url = `${window.location.origin}/api/webhooks/${integration.provider}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const scopes = OAUTH_SCOPES[integration.provider] ?? []
  const syncEvents = MOCK_SYNC_EVENTS[integration.provider] ?? []
  const stats = STATS[integration.provider] ?? STATS.hubspot
  const agentTags = AGENT_DATA_TAGS[integration.provider] ?? {}

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'livedata', label: 'Live Data' },
    { id: 'synclog', label: 'Sync Log' },
    { id: 'permissions', label: 'Permissions' },
    { id: 'agentmapping', label: 'Agent Mapping' },
  ]

  return (
    <div className="card fade-in" style={{ marginBottom: 24, padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 22px', borderBottom: '1px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(255,255,255,0.25)' }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: integration.logoColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 700, color: '#fff' }}>{integration.logo}</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{integration.name}</div>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-l)' }}>
            {AUTH_TYPE_LABEL[integration.authType] ?? integration.authType}
            {integration.workspaceName && ` · ${integration.workspaceName}`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-sm btn-sm-ghost" style={{ fontSize: 11, color: '#c0392b', borderColor: 'rgba(192,57,43,0.3)' }} onClick={() => { onDisconnect(); addToast(`Disconnected from ${integration.name}`, 'error') }}>
            Disconnect
          </button>
          <button className="btn-sm btn-sm-primary" style={{ fontSize: 11 }} onClick={() => addToast('Settings saved ✓')}>
            Save Changes
          </button>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'rgba(122,114,104,0.12)', cursor: 'pointer', fontSize: 14, color: 'var(--ink-l)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
      </div>

      {/* Error banner */}
      {integration.status === 'error' && (
        <div style={{ padding: '10px 22px', background: '#fdecea', borderBottom: '1px solid rgba(192,57,43,0.2)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#c0392b', fontSize: 14 }}>⚠</span>
          <span style={{ fontSize: 12, color: '#c0392b', flex: 1 }}>
            {integration.errorMessage ?? 'Authentication expired — syncing is paused.'}
          </span>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#c0392b', cursor: 'pointer' }}>
            Re-authenticate →
          </span>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ padding: '14px 22px 0', borderBottom: '1px solid rgba(255,255,255,0.35)', display: 'flex', gap: 0 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontFamily: "'DM Mono',monospace", fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: tab === t.id ? 'var(--ink)' : 'var(--ink-l)',
              borderBottom: tab === t.id ? '2px solid var(--orange)' : '2px solid transparent',
              marginBottom: -1, transition: 'color 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding: '22px', maxHeight: 420, overflowY: 'auto' }}>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div>
            <div className="stats-row" style={{ marginBottom: 20 }}>
              {stats.map(s => (
                <div key={s.label} className="stat-card" style={{ padding: '14px 16px' }}>
                  <div className="stat-label">{s.label}</div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, lineHeight: 1, color: integration.status === 'error' ? 'var(--ink-l)' : 'var(--ink)' }}>
                    {integration.status === 'error' ? '—' : s.value}
                    {s.unit && <span style={{ color: 'var(--orange)', fontSize: 20 }}>{s.unit}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* API Key field */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 6 }}>
                {AUTH_TYPE_LABEL[integration.authType]}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="password"
                  className="form-input"
                  style={{ flex: 1, fontFamily: "'DM Mono',monospace", fontSize: 12 }}
                  value={keyInput}
                  onChange={e => { setKeyInput(e.target.value); setTestMsg(null) }}
                  placeholder="Enter new key to update..."
                />
                <button className="btn-sm btn-sm-ghost" style={{ flexShrink: 0 }} onClick={handleTestKey} disabled={testingKey}>
                  {testingKey ? <span className="btn-loading"><span />Testing</span> : 'Test'}
                </button>
              </div>
              {testMsg && (
                <div style={{ fontSize: 11, marginTop: 6, color: testMsg.ok ? '#2a7d4f' : '#c0392b' }}>
                  {testMsg.ok ? '✓' : '✗'} {testMsg.text}
                </div>
              )}
            </div>

            {/* Sync Settings */}
            <div className="card" style={{ padding: '14px 18px', marginBottom: 14 }}>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 12 }}>Sync Settings</div>
              {([
                { key: 'syncContacts' as const, label: 'Sync Contacts', desc: 'Pull contact records from your CRM' },
                { key: 'syncDeals' as const, label: 'Sync Deals', desc: 'Import deal and opportunity data' },
                { key: 'syncActivities' as const, label: 'Sync Activities', desc: 'Track emails, calls, and meetings' },
                { key: 'webhookEnabled' as const, label: 'Webhook Events', desc: 'Receive real-time updates via webhook' },
              ] as const).map(row => (
                <div key={row.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.35)' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{row.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-l)' }}>{row.desc}</div>
                  </div>
                  <Toggle enabled={config[row.key]} onChange={() => updateConfig({ [row.key]: !config[row.key] })} />
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>Sync Frequency</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-l)' }}>How often to pull new data</div>
                </div>
                <select
                  style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, letterSpacing: '0.06em', padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.55)', color: 'var(--ink)', cursor: 'pointer' }}
                  value={config.syncFrequency}
                  onChange={e => updateConfig({ syncFrequency: e.target.value as Integration['config']['syncFrequency'] })}
                >
                  <option value="realtime">Realtime</option>
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                </select>
              </div>
            </div>

            {/* Webhook URL */}
            <div>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 6 }}>Webhook Endpoint</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  readOnly
                  className="form-input mono"
                  style={{ flex: 1, fontFamily: "'DM Mono',monospace", fontSize: 11, color: 'var(--ink-l)' }}
                  value={`${window.location.origin}/api/webhooks/${integration.provider}`}
                />
                <button className="btn-sm btn-sm-ghost" style={{ flexShrink: 0, fontSize: 11 }} onClick={copyWebhook}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── LIVE DATA ── */}
        {tab === 'livedata' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-l)' }}>Live Data</span>
                <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.06em', padding: '2px 8px', borderRadius: 100, background: 'rgba(245,166,35,0.15)', color: '#8a5000', border: '1px solid rgba(138,80,0,0.2)' }}>Demo</span>
              </div>
              <button className="btn-sm btn-sm-ghost" style={{ fontSize: 10 }} onClick={loadLiveData}>↻ Refresh</button>
            </div>

            {liveLoading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(212,80,26,0.2)', borderTopColor: 'var(--orange)', animation: 'spin 0.7s linear infinite' }} />
              </div>
            )}

            {liveError && (
              <div style={{ padding: '20px', textAlign: 'center', borderRadius: 10, background: '#fdecea', border: '1px solid rgba(192,57,43,0.2)' }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>⚠</div>
                <div style={{ fontSize: 13, color: '#c0392b' }}>{liveError}</div>
              </div>
            )}

            {liveData && !liveLoading && (
              <>
                {liveData.contacts && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Contacts ({liveData.contacts.length})</div>
                    <table className="data-table">
                      <thead><tr><th>Name</th><th>Email</th><th>Title</th><th>Company</th></tr></thead>
                      <tbody>
                        {liveData.contacts.map(c => (
                          <tr key={c.id}>
                            <td className="td-name">{c.properties.firstname} {c.properties.lastname}</td>
                            <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 11 }}>{c.properties.email}</td>
                            <td>{c.properties.jobtitle}</td>
                            <td className="td-company">{c.properties.company}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {liveData.deals && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Deals ({liveData.deals.length})</div>
                    <table className="data-table">
                      <thead><tr><th>Deal Name</th><th>Amount</th><th>Stage</th><th>Close Date</th></tr></thead>
                      <tbody>
                        {liveData.deals.map(d => (
                          <tr key={d.id}>
                            <td className="td-name">{d.properties.dealname}</td>
                            <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 11 }}>
                              {d.properties.amount ? `$${Number(d.properties.amount).toLocaleString()}` : '—'}
                            </td>
                            <td>
                              <span className="stage-badge stage-prospect" style={{ fontSize: 9 }}>
                                {d.properties.dealstage.replace(/([A-Z])/g, ' $1').toLowerCase()}
                              </span>
                            </td>
                            <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 11 }}>{d.properties.closedate ? d.properties.closedate.slice(0, 10) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {liveData.prospects && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Prospects ({liveData.prospects.length})</div>
                    <table className="data-table">
                      <thead><tr><th>Name</th><th>Email</th><th>Title</th><th>Company</th></tr></thead>
                      <tbody>
                        {liveData.prospects.map(p => (
                          <tr key={p.id}>
                            <td className="td-name">{p.first_name} {p.last_name}</td>
                            <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 11 }}>{p.email}</td>
                            <td>{p.title}</td>
                            <td className="td-company">{p.organization_name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {liveData.channels && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Channels ({liveData.channels.length})</div>
                    {liveData.channels.map(ch => (
                      <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.35)' }}>
                        <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: 'var(--ink)', flex: 1 }}>#{ch.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-l)', flex: 2 }}>{ch.purpose.value}</div>
                        <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: 'var(--ink-l)', width: 50, textAlign: 'right' }}>{ch.num_members} members</div>
                        <Toggle
                          enabled={ch.is_enabled ?? false}
                          onChange={() => {
                            setLiveData(prev => prev ? {
                              ...prev,
                              channels: prev.channels?.map(c => c.id === ch.id ? { ...c, is_enabled: !c.is_enabled } : c),
                            } : prev)
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── SYNC LOG ── */}
        {tab === 'synclog' && (
          <div>
            {syncEvents.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink-l)', fontSize: 13 }}>No sync events yet</div>
            )}
            {syncEvents.map(event => (
              <div key={event.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.3)' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${EVENT_COLOR[event.eventType]}18`, marginTop: 1 }}>
                  <span style={{ fontSize: 11, color: EVENT_COLOR[event.eventType] }}>{EVENT_ICON[event.eventType]}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--ink-m)', lineHeight: 1.4 }}>{event.message}</div>
                  <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: 'var(--ink-l)', marginTop: 3 }}>
                    {formatTimeAgo(event.createdAt)}
                    {event.recordCount !== undefined && event.recordCount > 0 && ` · ${event.recordCount.toLocaleString()} records`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── PERMISSIONS ── */}
        {tab === 'permissions' && (
          <div>
            {scopes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink-l)', fontSize: 13 }}>No scope information available</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Scope</th>
                    <th>Description</th>
                    <th>Access</th>
                    <th>Used By</th>
                    <th>Granted</th>
                  </tr>
                </thead>
                <tbody>
                  {scopes.map(scope => (
                    <tr key={scope.scope}>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: 'var(--ink)' }}>{scope.scope}</td>
                      <td style={{ fontSize: 11, color: 'var(--ink-l)' }}>{scope.description}</td>
                      <td>
                        <span style={{
                          fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase',
                          padding: '2px 7px', borderRadius: 100,
                          background: scope.accessLevel === 'write' ? 'rgba(138,80,0,0.1)' : 'rgba(77,157,224,0.1)',
                          color: scope.accessLevel === 'write' ? '#8a5000' : '#1a6fa8',
                          border: `1px solid ${scope.accessLevel === 'write' ? 'rgba(138,80,0,0.2)' : 'rgba(77,157,224,0.2)'}`,
                        }}>
                          {scope.accessLevel}
                        </span>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--ink-l)' }}>{scope.usedBy.join(', ')}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: 14, color: scope.granted ? '#2a7d4f' : 'var(--ink-l)' }}>
                          {scope.granted ? '✓' : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── AGENT MAPPING ── */}
        {tab === 'agentmapping' && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--ink-l)', marginBottom: 16, lineHeight: 1.5 }}>
              Control which agents can access data from {integration.name}. Changes take effect on the next sync.
            </div>
            {AGENTS.map(agent => {
              const tags = agentTags[agent.key] ?? []
              const enabled = config[agent.key]
              return (
                <div key={agent.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.35)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: agent.color, marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-l)' }}>Agent {agent.num}</span>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{agent.name}</span>
                    </div>
                    {enabled && tags.length > 0 ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {tags.map(tag => (
                          <span key={tag} style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.06em', padding: '2px 8px', borderRadius: 100, background: 'rgba(77,157,224,0.12)', color: '#1a6fa8', border: '1px solid rgba(77,157,224,0.22)' }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--ink-l)' }}>
                        {enabled ? 'No specific data fields configured' : 'Access disabled — enable to configure data access'}
                      </div>
                    )}
                  </div>
                  <Toggle enabled={enabled} onChange={() => updateConfig({ [agent.key]: !enabled })} />
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
