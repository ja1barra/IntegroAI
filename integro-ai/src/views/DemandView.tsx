import StatCard from '../components/ui/StatCard'
import AgentPill from '../components/ui/AgentPill'
import EmptyState from '../components/ui/EmptyState'
import { Icon } from '../components/ui/Icon'
import type { SharedViewProps } from '../types'
import { useDemandGen } from '../hooks/useDemandGen'

interface Props extends SharedViewProps {
  onNavigate: (view: string) => void
}

function scoreColor(score: number): string {
  if (score >= 65) return '#2a7d4f'
  if (score >= 40) return 'var(--orange)'
  return 'var(--ink-l)'
}

export default function DemandView({ active, agentStates, toggleAgent, addToast, onNavigate }: Props) {
  const demand = useDemandGen(addToast)
  const isRunning = agentStates.demand === 'running'
  const showDemoBanner = demand.demoMql || demand.traffic.demo

  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="agent-view-header">
        <div>
          <div className="agent-view-num">Agent 02</div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div className="display agent-view-name">Demand Generation</div>
            <AgentPill status={agentStates.demand} />
          </div>
          <div className="agent-view-sub">Content signals · Paid performance · MQL routing · Attribution</div>
        </div>
        <div className="agent-controls">
          <button className="control-btn" onClick={() => { toggleAgent('demand'); addToast(isRunning ? 'Agent paused' : 'Agent resumed') }}>{isRunning ? 'Pause Agent' : 'Resume Agent'}</button>
          <button className="control-btn" onClick={() => onNavigate('integrations')}>Connect Sources</button>
          <button className="btn-sm btn-sm-primary" onClick={demand.refresh} disabled={demand.loading}>
            {demand.loading ? <span className="btn-loading"><span />Syncing...</span> : (
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
          Showing demo data — connect HubSpot and Google Analytics 4 in{' '}
          <span style={{ color: 'var(--orange)', cursor: 'pointer', fontWeight: 500 }} onClick={() => onNavigate('integrations')}>Integrations</span>
          {' '}for MQLs and traffic from your own account.
        </div>
      )}

      <div className="stats-row">
        <StatCard label="Monthly Visitors" value={String(demand.traffic.monthlyVisitors)} active={active} />
        <StatCard label="MQLs This Month" value={String(demand.mqlsThisMonth)} active={active} />
        <StatCard label="CAC" value="—" active={active} />
        <StatCard label="Pipeline from Inbound" value="—" active={active} />
      </div>

      <div className="grid-2" style={{ marginBottom:12 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">Top Landing Pages</div></div>
          {demand.traffic.topPages.length === 0 ? (
            <EmptyState
              icon="mail"
              title="No traffic data yet"
              desc="Connect Google Analytics 4 in Integrations to see your top-performing pages."
              action={{ label: 'Connect GA4', onClick: () => onNavigate('integrations') }}
            />
          ) : (
            <table className="data-table">
              <thead><tr><th>Page</th><th>Sessions</th><th>Conversions</th></tr></thead>
              <tbody>
                {demand.traffic.topPages.map(p => (
                  <tr key={p.path}>
                    <td className="td-name" style={{ fontFamily: "'DM Mono',monospace", fontSize: 11 }}>{p.path}</td>
                    <td className="td-company">{p.sessions.toLocaleString()}</td>
                    <td className="td-company">{p.conversions.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">MQL Queue</div>
          </div>
          {demand.mqls.length === 0 ? (
            <EmptyState
              icon="checkCircle"
              title="Queue empty"
              desc="Connect HubSpot in Integrations to pull in and score marketing-qualified leads."
              action={{ label: 'Connect HubSpot', onClick: () => onNavigate('integrations') }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
              {demand.mqls.map(m => {
                const isRouted = demand.routed.has(m.id)
                const isRouting = demand.routing === m.id
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, border: '1px solid var(--rule)' }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 600,
                      color: scoreColor(m.score), border: `1.5px solid ${scoreColor(m.score)}`,
                    }}>
                      {m.score}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {m.firstName} {m.lastName}{m.company ? ` · ${m.company}` : ''}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-l)', marginTop: 1 }}>
                        {m.title || 'Unknown title'} — {m.stage} via {m.source}
                      </div>
                    </div>
                    <button
                      className="btn-sm btn-sm-ghost"
                      style={{ flexShrink: 0, fontSize: 11 }}
                      disabled={isRouted || isRouting}
                      onClick={() => demand.routeToOutbound(m)}
                    >
                      {isRouting ? '...' : isRouted ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2a7d4f' }}>
                          <Icon name="check" size={10} /> Routed
                        </span>
                      ) : 'Route to Outbound'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Channel Performance</div></div>
        {demand.traffic.channels.length === 0 ? (
          <EmptyState
            icon="demandGen"
            title="No channel data yet"
            desc="Connect Google Analytics 4 in Integrations to see channel performance."
            action={{ label: 'Connect GA4', onClick: () => onNavigate('integrations') }}
          />
        ) : (
          <table className="data-table">
            <thead><tr><th>Channel</th><th>Sessions</th><th>Conversions</th><th>Revenue</th></tr></thead>
            <tbody>
              {demand.traffic.channels.map(c => (
                <tr key={c.channel}>
                  <td className="td-name">{c.channel}</td>
                  <td className="td-company">{c.sessions.toLocaleString()}</td>
                  <td className="td-company">{c.conversions.toLocaleString()}</td>
                  <td className="td-company">${c.revenue.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
