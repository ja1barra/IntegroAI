import { useState } from 'react'
import StatCard from '../components/ui/StatCard'
import AgentPill from '../components/ui/AgentPill'
import EmptyState from '../components/ui/EmptyState'
import type { SharedViewProps } from '../types'

export default function OutboundView({ active, agentStates, toggleAgent, addToast }: SharedViewProps) {
  const [tab, setTab] = useState('overview')
  const [search, setSearch] = useState('')
  const isRunning = agentStates.outbound === 'running'

  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="agent-view-header">
        <div>
          <div className="agent-view-num">Agent 01</div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div className="display agent-view-name">Outbound Sales Machine</div>
            <AgentPill status={agentStates.outbound} />
          </div>
          <div className="agent-view-sub">ICP identification · Sequence execution · Meeting booking · Handoff</div>
        </div>
        <div className="agent-controls">
          <button className="control-btn" onClick={() => { toggleAgent('outbound'); addToast(isRunning ? 'Agent paused' : 'Agent resumed ✓') }}>{isRunning ? 'Pause Agent' : 'Resume Agent'}</button>
          <button className="control-btn">Settings</button>
          <button className="btn-sm btn-sm-primary" onClick={() => addToast('Sequence builder — coming soon')}>+ New Sequence</button>
        </div>
      </div>

      <div className="stats-row">
        {[
          { label:'In Sequence',     value:'--' },
          { label:'Open Rate',       value:'--' },
          { label:'Reply Rate',      value:'--' },
          { label:'Meetings Booked', value:'--' },
        ].map(s => <StatCard key={s.label} {...s} active={active} />)}
      </div>

      <div className="tabs">
        {['overview','prospects','sequences'].map(t => (
          <div key={t} className={`tab ${tab===t?'active':''}`} onClick={() => setTab(t)}>{t[0].toUpperCase()+t.slice(1)}</div>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="card">
          <EmptyState
            icon="⚡"
            title="No outbound data yet"
            desc="Connect your CRM or outbound tool to start syncing prospects, sequences, and pipeline data."
            action={{ label: 'Connect Integrations', onClick: () => addToast('Go to Integrations in the sidebar') }}
          />
        </div>
      )}

      {tab === 'prospects' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Prospects (0)</div>
            <input className="form-input" style={{ width:200, padding:'6px 10px', fontSize:12 }} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <EmptyState
            icon="👤"
            title="No prospects yet"
            desc="Prospects will appear here once your CRM or outbound tool is connected."
          />
        </div>
      )}

      {tab === 'sequences' && (
        <div className="card">
          <div className="card-header"><div className="card-title">All Sequences</div><div className="card-action" onClick={() => addToast('Sequence builder — coming soon')}>+ Create</div></div>
          <EmptyState
            icon="📧"
            title="No sequences yet"
            desc="Create your first sequence or connect your outbound tool to import existing ones."
            action={{ label: '+ New Sequence', onClick: () => addToast('Sequence builder — coming soon') }}
          />
        </div>
      )}
    </div>
  )
}
