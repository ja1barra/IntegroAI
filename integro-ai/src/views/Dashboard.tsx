import { useState } from 'react'
import StatCard from '../components/ui/StatCard'
import AgentPill from '../components/ui/AgentPill'
import EmptyState from '../components/ui/EmptyState'
import { Icon } from '../components/ui/Icon'
import type { SharedViewProps, Approval } from '../types'

export default function Dashboard({ active, onNavigate, agentStates, addToast }: SharedViewProps & { onNavigate: (v: string) => void }) {
  const [approvals] = useState<Approval[]>([])

  const agentCards = [
    { id:'outbound',       num:'01', name:'Outbound Sales Machine',   desc:'Prospecting, sequencing, and meeting booking — fully automated.' },
    { id:'demand',         num:'02', name:'Demand Generation',         desc:'Inbound pipeline, content signals, and MQL routing.' },
    { id:'success',        num:'03', name:'Customer Success Engine',   desc:'Health monitoring, churn risk flagging, and expansion tracking.' },
    { id:'playbook-agent', num:'04', name:'SaaS Growth Playbooks',     desc:'Win/loss analysis, coaching signals, and playbook generation.' },
  ]

  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="view-header">
        <div>
          <h1 className="display view-title">Revenue OS</h1>
        </div>
        <div className="view-actions">
          <button className="btn-sm btn-sm-ghost" onClick={() => addToast('No data to export yet')}>Export Report</button>
          <button className="btn-sm btn-sm-primary">+ New Task</button>
        </div>
      </div>

      <div className="stats-row">
        {[
          { label:'Pipeline Value',    value:'--' },
          { label:'Sequences Active',  value:'--' },
          { label:'Avg Health Score',  value:'--' },
          { label:'Meetings Booked',   value:'--' },
        ].map(s => <StatCard key={s.label} {...s} active={active} />)}
      </div>

      <div className="agent-cards-grid">
        {agentCards.map(a => (
          <div key={a.id} className={`agent-status-card ${agentStates[a.id as keyof typeof agentStates] === 'running' ? 'running' : ''}`} onClick={() => onNavigate(a.id)}>
            <div className="agent-card-top">
              <span className="agent-card-num">Agent {a.num}</span>
              <AgentPill status={agentStates[a.id as keyof typeof agentStates]} />
            </div>
            <div className="agent-card-name">{a.name}</div>
            <div className="agent-card-desc">{a.desc}</div>
            <div className="agent-card-metrics">
              <div className="agent-metric">
                <div className="agent-metric-val">--</div>
                <div className="agent-metric-label">No data yet</div>
              </div>
            </div>
            <div className="agent-card-footer">
              <span className="agent-last-run">Connect a CRM to sync data</span>
              <span className="agent-open-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Open <Icon name="arrowRight" size={11} />
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid-2-1" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Live Activity</div>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--ink-l)' }} />
              <span className="mono" style={{ fontSize:9, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--ink-l)' }}>Idle</span>
            </div>
          </div>
          <EmptyState
            icon="bolt"
            title="No activity yet"
            desc="Agent actions will appear here once your CRM is connected and agents start running."
            action={{ label: 'Connect Integrations', onClick: () => onNavigate('integrations') }}
          />
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Needs Approval</div>
          </div>
          {approvals.length === 0 ? (
            <div style={{ textAlign:'center', padding:'28px 16px', color:'var(--ink-l)' }}>
              <div style={{ display:'flex', justifyContent:'center', marginBottom:4, color:'#3ecf8e' }}>
                <Icon name="checkCircle" size={36} />
              </div>
              <div style={{ fontSize:13 }}>Nothing pending</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
