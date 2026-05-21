import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import IntegrationCard from './integrations/IntegrationCard'
import DetailPanel from './integrations/DetailPanel'
import ConnectModal from './integrations/ConnectModal'
import type { Integration, Provider } from '../lib/integrations/types'

const DEFAULT_CONFIG: Integration['config'] = {
  outbound: true, demandGen: true, customerSuccess: true, revenueIntelligence: false,
  syncContacts: true, syncDeals: true, syncActivities: false, webhookEnabled: true,
  syncFrequency: 'hourly',
}

const ACTIVE_INTEGRATIONS: Integration[] = [
  {
    id: 'hubspot', provider: 'hubspot', name: 'HubSpot CRM', logo: 'HS', logoColor: '#ff7a59',
    description: 'Two-way sync of contacts, deals, and timeline activities. Powers Outbound and Customer Success agents.',
    tags: ['CRM', 'Contacts', 'Deals'],
    status: 'connected', authType: 'private_app_token',
    lastSync: '2 min ago', recordCount: 1247, workspaceName: 'Integro Strategies',
    config: { ...DEFAULT_CONFIG, outbound: true, demandGen: true, customerSuccess: true, revenueIntelligence: false },
  },
  {
    id: 'apollo', provider: 'apollo', name: 'Apollo.io', logo: 'AP', logoColor: '#3b4eeb',
    description: 'Prospect enrichment, contact search, and sequence enrollment. 8,432 prospects synced.',
    tags: ['Outbound', 'Prospecting', 'Enrichment'],
    status: 'connected', authType: 'api_key',
    lastSync: '5 min ago', recordCount: 8432,
    config: { ...DEFAULT_CONFIG, outbound: true, demandGen: true, customerSuccess: false, revenueIntelligence: false },
  },
  {
    id: 'slack', provider: 'slack', name: 'Slack', logo: 'SL', logoColor: '#611f69',
    description: 'Agent alerts, deal notifications, approval requests, and churn risk escalations.',
    tags: ['Comms', 'Alerts', 'Approvals'],
    status: 'connected', authType: 'api_key',
    lastSync: '1 min ago', recordCount: 24, workspaceName: 'Integro Strategies',
    config: { ...DEFAULT_CONFIG, outbound: true, demandGen: true, customerSuccess: true, revenueIntelligence: false, syncDeals: false, syncActivities: false },
  },
  {
    id: 'klaviyo', provider: 'klaviyo', name: 'Klaviyo', logo: 'KL', logoColor: '#006bff',
    description: 'Email list management, campaign triggers, and subscriber lifecycle data for Demand Gen.',
    tags: ['Email', 'Marketing', 'Lists'],
    status: 'error', authType: 'api_key',
    errorMessage: 'API token expired on May 18 — syncing paused. Reconnect to resume.',
    config: { ...DEFAULT_CONFIG, outbound: false, demandGen: true, customerSuccess: true, revenueIntelligence: false },
  },
]

const AVAILABLE_INTEGRATIONS: Integration[] = [
  { id: 'salesforce', provider: 'salesforce', name: 'Salesforce', logo: 'SF', logoColor: '#00a1e0', description: 'Enterprise CRM with advanced reporting and forecasting.', tags: ['CRM', 'Enterprise'], status: 'available', authType: 'oauth', config: { ...DEFAULT_CONFIG } },
  { id: 'outreach', provider: 'outreach', name: 'Outreach', logo: 'OR', logoColor: '#5951e5', description: 'Sales engagement platform with sequence automation.', tags: ['Outbound', 'Sequences'], status: 'available', authType: 'oauth', config: { ...DEFAULT_CONFIG } },
  { id: 'linkedin', provider: 'linkedin', name: 'LinkedIn Sales Nav', logo: 'LI', logoColor: '#0077b5', description: 'Premium prospecting, InMail automation, and social selling.', tags: ['Outbound', 'Social'], status: 'available', authType: 'oauth', config: { ...DEFAULT_CONFIG } },
  { id: 'gong', provider: 'gong', name: 'Gong', logo: 'GO', logoColor: '#8b2fc9', description: 'Revenue intelligence from call recordings and coaching signals.', tags: ['Intelligence', 'Calls'], status: 'available', authType: 'api_key', config: { ...DEFAULT_CONFIG } },
  { id: 'intercom', provider: 'intercom', name: 'Intercom', logo: 'IC', logoColor: '#1f8dd6', description: 'Customer success messaging and product usage signals.', tags: ['Customer Success', 'Chat'], status: 'available', authType: 'oauth', config: { ...DEFAULT_CONFIG } },
  { id: 'zapier', provider: 'zapier', name: 'Zapier', logo: 'ZP', logoColor: '#ff4a00', description: 'Webhook automation and 5,000+ app integrations.', tags: ['Automation', 'Webhooks'], status: 'available', authType: 'api_key', config: { ...DEFAULT_CONFIG } },
  { id: 'ga4', provider: 'ga4', name: 'Google Analytics 4', logo: 'GA', logoColor: '#e37400', description: 'Web traffic, conversion tracking, and campaign attribution.', tags: ['Analytics', 'Marketing'], status: 'available', authType: 'oauth', config: { ...DEFAULT_CONFIG } },
]

function formatSyncTime(): string {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export default function IntegrationsView({ active, addToast }: { active: boolean; addToast: (m: string, t?: 'success' | 'error') => void }) {
  const [integrations, setIntegrations] = useState<Integration[]>(ACTIVE_INTEGRATIONS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [modalTarget, setModalTarget] = useState<Integration | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null)

  const loadFromSupabase = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('integrations')
        .select('provider, connected, config, auth_type, workspace_name, last_synced_at, record_count, error_message')
      if (!data || data.length === 0) return
      setIntegrations(prev => prev.map(int => {
        const row = data.find(d => d.provider === int.provider)
        if (!row) return int
        return {
          ...int,
          status: row.connected ? 'connected' : (row.error_message ? 'error' : 'configure'),
          workspaceName: row.workspace_name ?? int.workspaceName,
          lastSync: row.last_synced_at ? formatSyncTime() : int.lastSync,
          recordCount: row.record_count ?? int.recordCount,
          errorMessage: row.error_message ?? int.errorMessage,
          config: row.config ? (row.config as Integration['config']) : int.config,
        }
      }))
    } catch {
      // Table may not exist yet — continue with defaults
    }
  }, [])

  useEffect(() => {
    loadFromSupabase()
  }, [loadFromSupabase])

  const connectedCount = integrations.filter(i => i.status === 'connected').length
  const needsAttention = integrations.filter(i => i.status === 'error').length
  const selectedIntegration = integrations.find(i => i.id === selectedId) ?? null

  const handleCardClick = (id: string) => {
    setSelectedId(prev => prev === id ? null : id)
  }

  const handleSyncAll = async () => {
    setSyncing(true)
    await new Promise(r => setTimeout(r, 2000))
    const now = formatSyncTime()
    setLastSyncTime(now)
    setIntegrations(prev => prev.map(i =>
      i.status === 'connected' ? { ...i, lastSync: 'just now' } : i
    ))
    setSyncing(false)
    addToast(`All integrations synced at ${now} ✓`)
  }

  const handleConnectClick = (int: Integration) => {
    setModalTarget(int)
    setShowModal(true)
  }

  const handleConnectSuccess = async (int: Integration, _key: string) => {
    setIntegrations(prev => prev.map(i =>
      i.id === int.id ? { ...i, status: 'connected', lastSync: 'just now' } : i
    ))
    addToast(`${int.name} connected ✓`)
    try {
      await supabase.from('integrations').upsert({
        provider: int.provider,
        connected: true,
        auth_type: int.authType,
        config: int.config,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    } catch {
      // Non-fatal: Supabase table may not exist yet
    }
  }

  const handleDisconnect = async (id: string) => {
    const int = integrations.find(i => i.id === id)
    setIntegrations(prev => prev.map(i => i.id === id ? { ...i, status: 'configure', lastSync: undefined, recordCount: undefined } : i))
    setSelectedId(null)
    if (int) {
      try {
        await supabase.from('integrations').update({ connected: false }).eq('provider', int.provider)
      } catch {
        // Non-fatal
      }
    }
  }

  const handleConfigChange = async (id: string, config: Integration['config']) => {
    setIntegrations(prev => prev.map(i => i.id === id ? { ...i, config } : i))
    const int = integrations.find(i => i.id === id)
    if (!int) return
    try {
      await supabase.from('integrations').update({ config }).eq('provider', int.provider)
    } catch {
      // Non-fatal
    }
  }

  return (
    <div className={`view ${active ? 'active' : ''}`}>
      {/* Header */}
      <div className="view-header">
        <div>
          <div className="view-subtitle">Connected Tools</div>
          <h1 className="display view-title">Integrations</h1>
        </div>
        <div className="view-actions">
          <button
            className="btn-sm btn-sm-ghost"
            onClick={handleSyncAll}
            disabled={syncing}
          >
            {syncing ? <span className="btn-loading"><span />Syncing…</span> : '↻ Sync All'}
          </button>
          <button
            className="btn-sm btn-sm-primary"
            onClick={() => {
              setModalTarget(AVAILABLE_INTEGRATIONS[0])
              setShowModal(true)
            }}
          >
            + Add Integration
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="card" style={{ padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 0 }}>
        {[
          { label: 'Connected', value: connectedCount, color: '#2a7d4f', bg: '#eaf5ee', border: 'rgba(42,125,79,0.2)' },
          { label: 'Needs Attention', value: needsAttention, color: needsAttention > 0 ? '#c0392b' : 'var(--ink-l)', bg: needsAttention > 0 ? '#fdecea' : 'transparent', border: needsAttention > 0 ? 'rgba(192,57,43,0.2)' : 'transparent' },
          { label: 'Available', value: AVAILABLE_INTEGRATIONS.length, color: 'var(--ink-l)', bg: 'transparent', border: 'transparent' },
        ].map((stat, i) => (
          <div key={stat.label} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.5)' : 'none' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: stat.bg, border: `1px solid ${stat.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: stat.color, lineHeight: 1 }}>{stat.value}</span>
            </div>
            <div>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-l)' }}>{stat.label}</div>
            </div>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', paddingLeft: 20, borderLeft: '1px solid rgba(255,255,255,0.5)' }}>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-l)' }}>Last Sync</div>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: 'var(--ink-m)', marginTop: 2 }}>
            {lastSyncTime ?? 'Never synced'}
          </div>
        </div>
      </div>

      {/* Active integrations */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 12 }}>Active Integrations</div>
        <div className="grid-2" style={{ marginBottom: selectedIntegration ? 12 : 24 }}>
          {integrations.map(int => (
            <IntegrationCard
              key={int.id}
              {...int}
              selected={selectedId === int.id}
              onClick={() => {
                if (int.status === 'error') { handleConnectClick(int) }
                else { handleCardClick(int.id) }
              }}
            />
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {selectedIntegration && (
        <DetailPanel
          integration={selectedIntegration}
          onClose={() => setSelectedId(null)}
          onDisconnect={() => handleDisconnect(selectedIntegration.id)}
          onConfigChange={(cfg) => handleConfigChange(selectedIntegration.id, cfg)}
          addToast={addToast}
        />
      )}

      {/* Available integrations */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-l)' }}>Available Integrations</div>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: 'var(--orange)', cursor: 'pointer' }} onClick={() => addToast('Full integration marketplace — coming soon')}>
            View all →
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {AVAILABLE_INTEGRATIONS.map(int => (
            <IntegrationCard
              key={int.id}
              {...int}
              compact
              onClick={() => handleConnectClick(int)}
            />
          ))}
          {/* Request card */}
          <div
            className="card"
            style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', cursor: 'pointer' }}
            onClick={() => addToast("Integration request sent — we'll review it shortly ✓")}
          >
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(122,114,104,0.12)', border: '1px dashed rgba(122,114,104,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 20, color: 'var(--ink-l)' }}>+</span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>Request</div>
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--ink-l)' }}>
              Don't see yours?
            </span>
          </div>
        </div>
      </div>

      {/* Connect modal */}
      {showModal && modalTarget && (
        <ConnectModal
          provider={modalTarget.provider as Provider}
          name={modalTarget.name}
          logo={modalTarget.logo}
          logoColor={modalTarget.logoColor}
          mode={modalTarget.status === 'error' ? 'reconnect' : 'connect'}
          onClose={() => { setShowModal(false); setModalTarget(null) }}
          onSuccess={(key) => {
            if (modalTarget) handleConnectSuccess(modalTarget, key)
            setShowModal(false)
            setModalTarget(null)
          }}
        />
      )}
    </div>
  )
}
