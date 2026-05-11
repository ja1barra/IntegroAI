import { useState } from 'react'
import StatCard from '../components/ui/StatCard'
import AgentPill from '../components/ui/AgentPill'
import EmptyState from '../components/ui/EmptyState'
import type { SharedViewProps } from '../types'

interface MQL { id: string; name: string; source: string; score: number }

export default function DemandView({ active, agentStates, toggleAgent, addToast }: SharedViewProps) {
  const [mqls] = useState<MQL[]>([])
  const isRunning = agentStates.demand === 'running'

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
          <button className="control-btn" onClick={() => { toggleAgent('demand'); addToast(isRunning ? 'Agent paused' : 'Agent resumed ✓') }}>{isRunning ? 'Pause Agent' : 'Resume Agent'}</button>
          <button className="control-btn">Settings</button>
          <button className="btn-sm btn-sm-primary" onClick={() => addToast('Campaign builder — coming soon')}>+ New Campaign</button>
        </div>
      </div>

      <div className="stats-row">
        {[
          { label:'Monthly Visitors',      value:'--' },
          { label:'MQLs This Month',        value:'--' },
          { label:'CAC',                    value:'--' },
          { label:'Pipeline from Inbound',  value:'--' },
        ].map(s => <StatCard key={s.label} {...s} active={active} />)}
      </div>

      <div className="grid-2" style={{ marginBottom:12 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">Top Content by MQL Attribution</div></div>
          <EmptyState
            icon="📝"
            title="No content data yet"
            desc="Connect your marketing platform to track content attribution and MQL sources."
          />
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-title">MQL Queue</div>
          </div>
          {mqls.length === 0 ? (
            <div style={{ textAlign:'center', padding:'28px 0', color:'var(--ink-l)' }}>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, color:'#3ecf8e', marginBottom:4 }}>✓</div>
              <div style={{ fontSize:13 }}>Queue empty</div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Channel Performance</div></div>
        <EmptyState
          icon="📣"
          title="No channel data yet"
          desc="Connect your ad platforms and analytics tools to see channel performance."
        />
      </div>
    </div>
  )
}
