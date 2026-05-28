import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { saveCredential, loadCredential, updateSyncMeta } from '../lib/integrations/credentialStore'
import { testConnection as testHubspot, fetchContacts as fetchHubspotContacts } from '../lib/integrations/hubspot'
import { testConnection as testApollo, fetchContacts as fetchApolloContacts } from '../lib/integrations/apollo'
import { testConnection as testSlack, fetchChannels as fetchSlackChannels } from '../lib/integrations/slack'
import { testConnection as testSalesforce } from '../lib/integrations/salesforce'
import { testConnection as testOutreach } from '../lib/integrations/outreach'
import { testConnection as testLinkedin } from '../lib/integrations/linkedin'
import { testConnection as testGong } from '../lib/integrations/gong'
import { testConnection as testIntercom } from '../lib/integrations/intercom'
import { testConnection as testGA4 } from '../lib/integrations/ga4'
import IntegrationCard from './integrations/IntegrationCard'
import DetailPanel from './integrations/DetailPanel'
import ConnectModal from './integrations/ConnectModal'
import { RequestIcon } from './integrations/logos/IntegrationLogos'
import { Icon } from '../components/ui/Icon'
import type { Integration, Provider, TestResult } from '../lib/integrations/types'

const DEFAULT_CONFIG: Integration['config'] = {
  outbound: true, demandGen: true, customerSuccess: true, revenueIntelligence: false,
  syncContacts: true, syncDeals: true, syncActivities: false, webhookEnabled: true,
  syncFrequency: 'hourly',
}

const ACTIVE_INTEGRATIONS: Integration[] = []

const AVAILABLE_INTEGRATIONS: Integration[] = [
  { id: 'hubspot',    provider: 'hubspot',    name: 'HubSpot CRM',         logo: 'HS', logoColor: '#ff7a59', logoBg: '#fff3ee', description: 'Two-way sync of contacts, deals, and timeline activities.',               tags: ['CRM', 'Contacts', 'Deals'],  status: 'available', authType: 'private_app_token', config: { ...DEFAULT_CONFIG } },
  { id: 'apollo',     provider: 'apollo',     name: 'Apollo.io',           logo: 'AP', logoColor: '#3b4eeb', logoBg: '#eef3ff', description: 'Prospect enrichment, contact search, and sequence enrollment.',            tags: ['Outbound', 'Prospecting'],   status: 'available', authType: 'api_key', config: { ...DEFAULT_CONFIG } },
  { id: 'slack',      provider: 'slack',      name: 'Slack',               logo: 'SL', logoColor: '#611f69', logoBg: '#f0f7ff', description: 'Agent alerts, deal notifications, approval requests, and escalations.',   tags: ['Comms', 'Alerts'],           status: 'available', authType: 'api_key', config: { ...DEFAULT_CONFIG } },
  { id: 'klaviyo',    provider: 'klaviyo',    name: 'Klaviyo',             logo: 'KL', logoColor: '#006bff', logoBg: '#fdf0f0', description: 'Email list management, campaign triggers, and subscriber lifecycle.',      tags: ['Email', 'Marketing'],        status: 'available', authType: 'api_key', config: { ...DEFAULT_CONFIG } },
  { id: 'salesforce', provider: 'salesforce', name: 'Salesforce',          logo: 'SF', logoColor: '#00a1e0', logoBg: '#e8f5fe', description: 'Enterprise CRM with advanced reporting and forecasting.',                  tags: ['CRM', 'Enterprise'],         status: 'available', authType: 'oauth',   config: { ...DEFAULT_CONFIG } },
  { id: 'outreach',   provider: 'outreach',   name: 'Outreach',            logo: 'OR', logoColor: '#5951e5', logoBg: '#f0eeff', description: 'Sales engagement platform with sequence automation.',                     tags: ['Outbound', 'Sequences'],     status: 'available', authType: 'oauth',   config: { ...DEFAULT_CONFIG } },
  { id: 'linkedin',   provider: 'linkedin',   name: 'LinkedIn Sales Nav',  logo: 'LI', logoColor: '#0077b5', logoBg: '#e8f2fa', description: 'Premium prospecting, InMail automation, and social selling.',            tags: ['Outbound', 'Social'],        status: 'available', authType: 'oauth',   config: { ...DEFAULT_CONFIG } },
  { id: 'gong',       provider: 'gong',       name: 'Gong',                logo: 'GO', logoColor: '#8b2fc9', logoBg: '#f2eaff', description: 'Revenue intelligence from call recordings and coaching signals.',         tags: ['Intelligence', 'Calls'],     status: 'available', authType: 'api_key', config: { ...DEFAULT_CONFIG } },
  { id: 'intercom',   provider: 'intercom',   name: 'Intercom',            logo: 'IC', logoColor: '#1f8dd6', logoBg: '#e8f4ff', description: 'Customer success messaging and product usage signals.',                   tags: ['Customer Success', 'Chat'],  status: 'available', authType: 'oauth',   config: { ...DEFAULT_CONFIG } },
  { id: 'zapier',     provider: 'zapier',     name: 'Zapier',              logo: 'ZP', logoColor: '#ff4a00', logoBg: '#fff1ec', description: 'Webhook automation and 5,000+ app integrations.',                        tags: ['Automation', 'Webhooks'],    status: 'available', authType: 'api_key', config: { ...DEFAULT_CONFIG } },
  { id: 'ga4',        provider: 'ga4',        name: 'Google Analytics 4',  logo: 'GA', logoColor: '#e37400', logoBg: '#fff8e8', description: 'Web traffic, conversion tracking, and campaign attribution.',             tags: ['Analytics', 'Marketing'],    status: 'available', authType: 'oauth',   config: { ...DEFAULT_CONFIG } },
]

function formatSyncTime(): string {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

async function syncOneIntegration(provider: string): Promise<{ recordCount?: number; workspaceName?: string }> {
  const credential = await loadCredential(provider)
  if (!credential) return {}

  if (provider === 'hubspot') {
    const result: TestResult = await testHubspot(credential)
    if (!result.ok) throw new Error(result.error ?? 'HubSpot sync failed')
    try {
      const contacts = await fetchHubspotContacts(credential)
      await updateSyncMeta('hubspot', { recordCount: result.data?.total ?? contacts.length })
      return { recordCount: result.data?.total ?? contacts.length }
    } catch {
      await updateSyncMeta('hubspot', { recordCount: result.data?.total })
      return { recordCount: result.data?.total }
    }
  }

  if (provider === 'apollo') {
    const result: TestResult = await testApollo(credential)
    if (!result.ok) throw new Error(result.error ?? 'Apollo sync failed')
    try {
      const contacts = await fetchApolloContacts(credential)
      await updateSyncMeta('apollo', { recordCount: contacts.length })
      return { recordCount: contacts.length }
    } catch {
      await updateSyncMeta('apollo', {})
      return {}
    }
  }

  if (provider === 'slack') {
    const result: TestResult = await testSlack(credential)
    if (!result.ok) throw new Error(result.error ?? 'Slack sync failed')
    const channels = await fetchSlackChannels(credential)
    await updateSyncMeta('slack', { recordCount: channels.length, workspaceName: result.data?.team })
    return { recordCount: channels.length, workspaceName: result.data?.team }
  }

  if (provider === 'salesforce') {
    const result: TestResult = await testSalesforce(credential)
    if (!result.ok) throw new Error(result.error ?? 'Salesforce sync failed')
    await updateSyncMeta('salesforce', { recordCount: result.data?.total })
    return { recordCount: result.data?.total }
  }

  if (provider === 'outreach') {
    const result: TestResult = await testOutreach(credential)
    if (!result.ok) throw new Error(result.error ?? 'Outreach sync failed')
    await updateSyncMeta('outreach', { recordCount: result.data?.total })
    return { recordCount: result.data?.total }
  }

  if (provider === 'linkedin') {
    const result: TestResult = await testLinkedin(credential)
    if (!result.ok) throw new Error(result.error ?? 'LinkedIn sync failed')
    await updateSyncMeta('linkedin', { recordCount: result.data?.total })
    return { recordCount: result.data?.total }
  }

  if (provider === 'gong') {
    const result: TestResult = await testGong(credential)
    if (!result.ok) throw new Error(result.error ?? 'Gong sync failed')
    await updateSyncMeta('gong', { recordCount: result.data?.total })
    return { recordCount: result.data?.total }
  }

  if (provider === 'intercom') {
    const result: TestResult = await testIntercom(credential)
    if (!result.ok) throw new Error(result.error ?? 'Intercom sync failed')
    await updateSyncMeta('intercom', { recordCount: result.data?.total, workspaceName: result.data?.team })
    return { recordCount: result.data?.total, workspaceName: result.data?.team }
  }

  if (provider === 'ga4') {
    const result: TestResult = await testGA4(credential)
    if (!result.ok) throw new Error(result.error ?? 'GA4 sync failed')
    await updateSyncMeta('ga4', { recordCount: result.data?.total })
    return { recordCount: result.data?.total }
  }

  return {}
}

export default function IntegrationsView({ active, addToast }: { active: boolean; addToast: (m: string, t?: 'success' | 'error') => void }) {
  const [integrations, setIntegrations] = useState<Integration[]>([...ACTIVE_INTEGRATIONS, ...AVAILABLE_INTEGRATIONS])
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

  const activeIntegrations = integrations.filter(i => i.status !== 'available')
  const availableIntegrations = integrations.filter(i => i.status === 'available')
  const connectedCount = integrations.filter(i => i.status === 'connected').length
  const needsAttention = integrations.filter(i => i.status === 'error').length
  const selectedIntegration = integrations.find(i => i.id === selectedId) ?? null

  const handleCardClick = (id: string) => {
    setSelectedId(prev => prev === id ? null : id)
  }

  const handleSyncAll = async () => {
    setSyncing(true)
    const connected = activeIntegrations.filter(i => i.status === 'connected')

    const results = await Promise.allSettled(
      connected.map(int => syncOneIntegration(int.provider))
    )

    const now = formatSyncTime()
    setLastSyncTime(now)

    setIntegrations(prev => prev.map(int => {
      if (int.status !== 'connected') return int
      const idx = connected.findIndex(c => c.id === int.id)
      const result = results[idx]
      if (!result) return { ...int, lastSync: 'just now' }
      if (result.status === 'fulfilled') {
        return {
          ...int,
          lastSync: 'just now',
          ...(result.value.recordCount !== undefined && { recordCount: result.value.recordCount }),
          ...(result.value.workspaceName && { workspaceName: result.value.workspaceName }),
        }
      }
      return { ...int, lastSync: 'just now' }
    }))

    const failed = results.filter(r => r.status === 'rejected').length
    setSyncing(false)

    if (failed > 0) {
      addToast(`Synced ${connected.length - failed} integrations, ${failed} had errors`, 'error')
    } else {
      addToast(`All ${connected.length} integrations synced at ${now}`)
    }
  }

  const handleConnectClick = (int: Integration) => {
    setModalTarget(int)
    setShowModal(true)
  }

  const handleConnectSuccess = async (int: Integration, key: string, testResult?: TestResult) => {
    // Save credential to Supabase
    if (key) {
      try {
        await saveCredential(int.provider, key, {
          workspaceName: testResult?.data?.team,
          recordCount: testResult?.data?.total,
        })
      } catch (e) {
        console.error('Failed to save credential:', e)
      }
    }

    const workspaceName = testResult?.data?.team ?? int.workspaceName
    const recordCount = testResult?.data?.total ?? int.recordCount

    setIntegrations(prev => prev.map(i =>
      i.id === int.id
        ? { ...i, status: 'connected', lastSync: 'just now', errorMessage: undefined, workspaceName, recordCount }
        : i
    ))
    addToast(`${int.name} connected`)
  }

  const handleDisconnect = async (id: string) => {
    const int = integrations.find(i => i.id === id)
    setIntegrations(prev => prev.map(i => i.id === id ? { ...i, status: 'configure', lastSync: undefined, recordCount: undefined, errorMessage: undefined } : i))
    setSelectedId(null)
    if (int) {
      try {
        await supabase.from('integrations').update({ connected: false, key_encrypted: null }).eq('provider', int.provider)
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
            {syncing ? (
              <span className="btn-loading"><span />Syncing...</span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Icon name="sync" size={13} /> Sync All
              </span>
            )}
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
          { label: 'Available', value: availableIntegrations.length, color: 'var(--ink-l)', bg: 'transparent', border: 'transparent' },
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

      {/* Active integrations — only shown once something is connected */}
      {activeIntegrations.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 12 }}>Active Integrations</div>
          <div className="grid-2" style={{ marginBottom: selectedIntegration ? 12 : 24 }}>
            {activeIntegrations.map(int => (
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
      )}

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
          <span
            style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: 'var(--orange)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onClick={() => addToast('Full integration marketplace — coming soon')}
          >
            View all <Icon name="arrowRight" size={10} />
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
          {availableIntegrations.map(int => (
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
            onClick={() => addToast("Integration request sent — we'll review it shortly")}
          >
            <div style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RequestIcon size={36} />
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
          onSuccess={(key, testResult) => {
            if (modalTarget) handleConnectSuccess(modalTarget, key, testResult)
            setShowModal(false)
            setModalTarget(null)
          }}
        />
      )}
    </div>
  )
}
