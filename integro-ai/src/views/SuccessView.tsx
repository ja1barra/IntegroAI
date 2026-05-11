import StatCard from '../components/ui/StatCard'
import AgentPill from '../components/ui/AgentPill'
import EmptyState from '../components/ui/EmptyState'
import type { SharedViewProps } from '../types'

export default function SuccessView({ active, agentStates, toggleAgent, addToast }: SharedViewProps) {
  const isRunning = agentStates.success === 'running'

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
          <button className="control-btn" onClick={() => { toggleAgent('success'); addToast(isRunning ? 'Agent paused' : 'Agent resumed ✓') }}>{isRunning ? 'Pause Agent' : 'Resume Agent'}</button>
          <button className="control-btn">Settings</button>
          <button className="btn-sm btn-sm-primary" onClick={() => addToast('Account import — coming soon')}>+ Add Account</button>
        </div>
      </div>

      <div className="stats-row">
        {[
          { label:'Active Accounts',    value:'--' },
          { label:'Avg Health Score',   value:'--' },
          { label:'At-Risk Accounts',   value:'--' },
          { label:'Expansion Pipeline', value:'--' },
        ].map(s => <StatCard key={s.label} {...s} active={active} />)}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Account Health Overview</div>
          </div>
          <EmptyState
            icon="💎"
            title="No accounts yet"
            desc="Connect your CRM to sync customer accounts and start tracking health scores."
            action={{ label: 'Connect CRM', onClick: () => addToast('Go to Integrations in the sidebar') }}
          />
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="card">
            <div className="card-header"><div className="card-title">Expansion Opportunities</div><span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--ink-l)' }}>$--</span></div>
            <EmptyState
              icon="📈"
              title="No opportunities yet"
              desc="Expansion opportunities will appear once accounts are synced from your CRM."
            />
          </div>
        </div>
      </div>
    </div>
  )
}
