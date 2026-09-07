import StatCard from '../components/ui/StatCard'
import AgentPill from '../components/ui/AgentPill'
import EmptyState from '../components/ui/EmptyState'
import HealthRing from '../components/ui/HealthRing'
import { Icon } from '../components/ui/Icon'
import type { SharedViewProps, Task } from '../types'
import type { AccountStatus } from '../lib/success/types'
import { useCustomerSuccess } from '../hooks/useCustomerSuccess'

interface Props extends SharedViewProps {
  onNavigate: (view: string) => void
  addTask: (data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => void
}

const STATUS_META: Record<AccountStatus, { label: string; color: string }> = {
  healthy: { label: 'Healthy', color: '#2a7d4f' },
  watch: { label: 'Watch', color: 'var(--orange)' },
  at_risk: { label: 'At Risk', color: '#c0392b' },
}

export default function SuccessView({ active, agentStates, toggleAgent, addToast, onNavigate, addTask }: Props) {
  const success = useCustomerSuccess(addToast, addTask)
  const isRunning = agentStates.success === 'running'
  const showDemoBanner = success.demoAccounts || success.expansion.demo

  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="agent-view-header">
        <div>
          <div className="agent-view-num">Agent 03</div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div className="display agent-view-name">Customer Success Engine</div>
            <AgentPill status={agentStates.success} />
          </div>
          <div className="agent-view-sub">Health monitoring · Churn risk · Expansion · Renewal tracking</div>
        </div>
        <div className="agent-controls">
          <button className="control-btn" onClick={() => { toggleAgent('success'); addToast(isRunning ? 'Agent paused' : 'Agent resumed') }}>{isRunning ? 'Pause Agent' : 'Resume Agent'}</button>
          <button className="control-btn" onClick={() => onNavigate('integrations')}>Connect Sources</button>
          <button className="btn-sm btn-sm-primary" onClick={success.refresh} disabled={success.loading}>
            {success.loading ? <span className="btn-loading"><span />Syncing...</span> : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="sync" size={12} /> Sync Now
              </span>
            )}
          </button>
        </div>
      </div>

      {showDemoBanner && (
        <div style={{ padding: '10px 16px', borderRadius: 10, background: 'var(--cream-d)', border: '1px solid var(--rule)', marginBottom: 16, fontSize: 12, color: 'var(--ink-m)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="info" size={13} style={{ color: 'var(--ink-l)', flexShrink: 0 }} />
          Showing demo data — connect Intercom and HubSpot in{' '}
          <span style={{ color: 'var(--orange)', cursor: 'pointer', fontWeight: 500 }} onClick={() => onNavigate('integrations')}>Integrations</span>
          {' '}for account health and expansion pipeline from your own account.
        </div>
      )}

      <div className="stats-row">
        <StatCard label="Active Accounts"    value={String(success.activeCount)} active={active} />
        <StatCard label="Avg Health Score"   value={String(success.avgHealthScore)} active={active} />
        <StatCard label="At-Risk Accounts"   value={String(success.atRiskCount)} active={active} />
        <StatCard label="Expansion Pipeline" value={String(success.expansion.pipelineAmount)} prefix="$" active={active} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Account Health Overview</div>
          </div>
          {success.accounts.length === 0 ? (
            <EmptyState
              icon="customerSuccess"
              title="No accounts yet"
              desc="Connect Intercom in Integrations to sync customer accounts and start tracking health scores."
              action={{ label: 'Connect Intercom', onClick: () => onNavigate('integrations') }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 460, overflowY: 'auto' }}>
              {success.accounts.map(a => {
                const isFlagged = success.flagged.has(a.id)
                const meta = STATUS_META[a.status]
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--rule)' }}>
                    <HealthRing score={a.healthScore} size={48} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {a.name}{a.company ? ` · ${a.company}` : ''}
                        </span>
                        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 'var(--radius-pill)', color: meta.color, border: `1px solid ${meta.color}`, flexShrink: 0 }}>
                          {meta.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-l)', marginTop: 2 }}>
                        {a.plan} plan
                        {a.lastSeenDaysAgo !== null ? ` — last active ${a.lastSeenDaysAgo}d ago` : ' — never seen active'}
                        {a.openConversations > 0 ? `, ${a.openConversations} open conversation${a.openConversations === 1 ? '' : 's'}` : ''}
                      </div>
                    </div>
                    <button
                      className="btn-sm btn-sm-ghost"
                      style={{ flexShrink: 0, fontSize: 11 }}
                      disabled={isFlagged}
                      onClick={() => success.flagForFollowUp(a)}
                    >
                      {isFlagged ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2a7d4f' }}>
                          <Icon name="check" size={10} /> Flagged
                        </span>
                      ) : 'Flag for Follow-up'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Expansion Opportunities</div>
              <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--ink-l)' }}>
                ${success.expansion.pipelineAmount.toLocaleString()}
              </span>
            </div>
            {success.expansion.deals.length === 0 ? (
              <EmptyState
                icon="revenueIntelligence"
                title="No opportunities yet"
                desc="Connect HubSpot in Integrations — expansion deals (dealtype: existing business) will appear here."
                action={{ label: 'Connect HubSpot', onClick: () => onNavigate('integrations') }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {success.expansion.deals.map(d => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--rule)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-l)', marginTop: 1 }}>{d.stage}</div>
                    </div>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: 'var(--ink-m)', flexShrink: 0 }}>${d.amount.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
