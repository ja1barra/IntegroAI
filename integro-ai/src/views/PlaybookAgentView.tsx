import StatCard from '../components/ui/StatCard'
import AgentPill from '../components/ui/AgentPill'
import EmptyState from '../components/ui/EmptyState'
import type { SharedViewProps } from '../types'

export default function PlaybookAgentView({ active, agentStates, toggleAgent, addToast }: SharedViewProps) {
  const isRunning = agentStates['playbook-agent'] === 'running'

  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="agent-view-header">
        <div>
          <div className="agent-view-num">Agent 04</div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div className="display agent-view-name">SaaS Growth Playbooks</div>
            <AgentPill status={agentStates['playbook-agent']} />
          </div>
          <div className="agent-view-sub">Win/loss analysis · Playbook generation · Coaching signals · Forecasting</div>
        </div>
        <div className="agent-controls">
          <button className="control-btn" onClick={() => { toggleAgent('playbook-agent'); addToast(isRunning ? 'Agent paused' : 'Agent resumed ✓') }}>{isRunning ? 'Pause Agent' : 'Resume Agent'}</button>
          <button className="control-btn">Settings</button>
          <button className="btn-sm btn-sm-primary" onClick={() => addToast('Playbook builder — coming soon')}>+ New Playbook</button>
        </div>
      </div>

      <div className="stats-row">
        {[
          { label:'Active Playbooks', value:'--' },
          { label:'Win Rate',         value:'--' },
          { label:'Avg Deal Cycle',   value:'--' },
          { label:'New Insights',     value:'--' },
        ].map(s => <StatCard key={s.label} {...s} active={active} />)}
      </div>

      <div className="grid-1-2">
        <div className="card" style={{ alignSelf:'start' }}>
          <div className="card-header">
            <div className="card-title">New Insights</div>
          </div>
          <div style={{ textAlign:'center', padding:'20px 0', color:'var(--ink-l)', fontSize:12 }}>
            Insights will surface once deal data is connected.
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Active Playbooks</div><div className="card-action" onClick={() => addToast('Builder — coming soon')}>Create New</div></div>
          <EmptyState
            icon="🧠"
            title="No playbooks yet"
            desc="Create your first playbook manually or connect your CRM so the agent can generate them from your win/loss data."
            action={{ label: '+ New Playbook', onClick: () => addToast('Playbook builder — coming soon') }}
          />
        </div>
      </div>
    </div>
  )
}
