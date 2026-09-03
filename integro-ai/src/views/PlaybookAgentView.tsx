import StatCard from '../components/ui/StatCard'
import AgentPill from '../components/ui/AgentPill'
import EmptyState from '../components/ui/EmptyState'
import { Icon } from '../components/ui/Icon'
import type { SharedViewProps } from '../types'
import type { Playbook } from '../lib/playbooks/types'

interface Props extends SharedViewProps {
  onNavigate: (v: string) => void
  playbooks: Playbook[]
  stats: { total: number; active: number; avgWinRate: number | null; avgDealCycleDays: number | null }
  onNew: () => void
  onGenerate: () => void
}

export default function PlaybookAgentView({ active, agentStates, toggleAgent, addToast, onNavigate, playbooks, stats, onNew, onGenerate }: Props) {
  const isRunning = agentStates['playbook-agent'] === 'running'
  const aiGenerated = playbooks.filter(p => p.source !== 'manual').length
  const activePlaybooks = (playbooks.filter(p => p.status === 'active').length ? playbooks.filter(p => p.status === 'active') : playbooks).slice(0, 5)

  // Most recently added plays across every playbook — a lightweight stand-in
  // for "insights" until win/loss coaching signals ship.
  const recentPlays = [...playbooks]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .flatMap(pb => pb.plays.map(play => ({ play, playbook: pb })))
    .slice(0, 4)

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
          <button className="control-btn" onClick={() => { toggleAgent('playbook-agent'); addToast(isRunning ? 'Agent paused' : 'Agent resumed') }}>{isRunning ? 'Pause Agent' : 'Resume Agent'}</button>
          <button className="control-btn" onClick={onGenerate}>
            <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><Icon name="sparkles" size={12} /> Generate</span>
          </button>
          <button className="btn-sm btn-sm-primary" onClick={onNew}>+ New Playbook</button>
        </div>
      </div>

      <div className="stats-row">
        {[
          { label:'Active Playbooks', value: String(stats.active) },
          { label:'Win Rate',         value: stats.avgWinRate !== null ? `${stats.avgWinRate}` : '--', unit: stats.avgWinRate !== null ? '%' : undefined },
          { label:'Avg Deal Cycle',   value: stats.avgDealCycleDays !== null ? `${stats.avgDealCycleDays}` : '--', unit: stats.avgDealCycleDays !== null ? 'd' : undefined },
          { label:'AI Generated',     value: String(aiGenerated) },
        ].map(s => <StatCard key={s.label} {...s} active={active} />)}
      </div>

      <div className="grid-1-2">
        <div className="card" style={{ alignSelf:'start' }}>
          <div className="card-header">
            <div className="card-title">Recent Plays</div>
          </div>
          {recentPlays.length === 0 ? (
            <div style={{ textAlign:'center', padding:'20px 0', color:'var(--ink-l)', fontSize:12 }}>
              Insights will surface once you have playbooks with plays.
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {recentPlays.map(({ play, playbook }) => (
                <div key={play.id} style={{ paddingBottom:10, borderBottom:'1px solid var(--rule-m)' }}>
                  <div style={{ fontSize:12.5, fontWeight:600 }}>{play.title}</div>
                  <div style={{ fontSize:11, color:'var(--ink-l)', marginTop:2 }}>from “{playbook.title}”</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Active Playbooks</div><div className="card-action" onClick={() => onNavigate('playbooks')}>View All</div></div>
          {activePlaybooks.length === 0 ? (
            <EmptyState
              icon="agents"
              title="No playbooks yet"
              desc="Create your first playbook manually or connect your CRM so the agent can generate them from your win/loss data."
              action={{ label: '+ New Playbook', onClick: onNew }}
            />
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {activePlaybooks.map(pb => (
                <div
                  key={pb.id}
                  style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid var(--rule-m)', cursor:'pointer' }}
                  onClick={() => onNavigate('playbooks')}
                >
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>{pb.title}</div>
                    <div style={{ fontSize:11, color:'var(--ink-l)' }}>{pb.category} · {pb.plays.length} plays</div>
                  </div>
                  {pb.winRatePct !== null && (
                    <div style={{ fontSize:12, color:'var(--ink-l)', flexShrink:0 }}>{pb.winRatePct}% win</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
