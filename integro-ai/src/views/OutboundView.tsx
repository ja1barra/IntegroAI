import { useState } from 'react'
import StatCard from '../components/ui/StatCard'
import AgentPill from '../components/ui/AgentPill'
import StageBadge from '../components/ui/StageBadge'
import type { SharedViewProps, StageKey } from '../types'

const PROSPECTS = [
  { name:'Sarah Chen',     co:'Synapse.io',    stage:'meeting'   as StageKey, sent:5 },
  { name:'Marcus Webb',    co:'PivotHQ',        stage:'replied'   as StageKey, sent:3 },
  { name:'Priya Patel',    co:'Clearfield AI',  stage:'contacted' as StageKey, sent:2 },
  { name:'Tom Alvarez',    co:'Stackline',      stage:'prospect'  as StageKey, sent:1 },
  { name:'Dana Houck',     co:'Revex Labs',     stage:'contacted' as StageKey, sent:4 },
  { name:'Kenji Watanabe', co:'Meridian SaaS',  stage:'replied'   as StageKey, sent:3 },
  { name:'Ana Souza',      co:'FlowLogic',      stage:'prospect'  as StageKey, sent:1 },
  { name:'Chris Park',     co:'Datavine',       stage:'meeting'   as StageKey, sent:6 },
]

export default function OutboundView({ active, agentStates, toggleAgent, addToast }: SharedViewProps) {
  const [tab, setTab] = useState('overview')
  const [search, setSearch] = useState('')
  const isRunning = agentStates.outbound === 'running'
  const filtered = PROSPECTS.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.co.toLowerCase().includes(search.toLowerCase()))
  const sequences = [
    { n:'01', type:'Email',    cls:'seq-email',    name:'Cold Intro — Fintech ICP',  day:'Day 1',  stat:'44% open' },
    { n:'02', type:'LinkedIn', cls:'seq-linkedin', name:'Connection Request',         day:'Day 3',  stat:'38% accept' },
    { n:'03', type:'Email',    cls:'seq-email',    name:'Value-Add Follow-Up',        day:'Day 6',  stat:'31% open' },
    { n:'04', type:'Call',     cls:'seq-call',     name:'Phone Touch — SDR',          day:'Day 9',  stat:'18% connect' },
    { n:'05', type:'Email',    cls:'seq-email',    name:'Breakup / Last Touch',       day:'Day 14', stat:'22% reply' },
  ]
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
          { label:'In Sequence',     value:'284', delta:'↑ 42 this week', deltaType:'delta-up'   as const },
          { label:'Open Rate',       value:'41',  unit:'%', delta:'↑ 3pts', deltaType:'delta-up' as const },
          { label:'Reply Rate',      value:'23',  unit:'%', delta:'↑ 1pt',  deltaType:'delta-up' as const },
          { label:'Meetings Booked', value:'12',  delta:'→ On pace', deltaType:'delta-flat'      as const },
        ].map(s => <StatCard key={s.label} {...s} active={active} />)}
      </div>
      <div className="tabs">
        {['overview','prospects','sequences'].map(t => (
          <div key={t} className={`tab ${tab===t?'active':''}`} onClick={() => setTab(t)}>{t[0].toUpperCase()+t.slice(1)}</div>
        ))}
      </div>
      {tab === 'overview' && (
        <>
          <div className="card" style={{ marginBottom:12 }}>
            <div className="card-header"><div className="card-title">Pipeline Funnel</div></div>
            <div className="pipeline-stages">
              {[{num:847,name:'ICP Identified'},{num:284,name:'In Sequence'},{num:67,name:'Replied'},{num:28,name:'Interested'},{num:12,name:'Meeting Set'}].map((s,i) => (
                <div key={s.name} className={`pipeline-stage ${i===2?'active-stage':''}`} onClick={() => addToast(`${s.name}: ${s.num} prospects`)}>
                  <div className="pipeline-stage-num">{s.num}</div>
                  <div className="pipeline-stage-name">{s.name}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">Active Sequences</div><div className="card-action">Manage All</div></div>
            <div className="sequence-list">
              {sequences.map(s => (
                <div key={s.n} className="sequence-step">
                  <span className="seq-num">{s.n}</span><span className={`seq-type ${s.cls}`}>{s.type}</span>
                  <span className="seq-name">{s.name}</span><span className="seq-delay">{s.day}</span><span className="seq-stat">{s.stat}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {tab === 'prospects' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Prospects ({filtered.length})</div>
            <input className="form-input" style={{ width:200, padding:'6px 10px', fontSize:12 }} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <table className="data-table">
            <thead><tr><th>Name</th><th>Company</th><th>Stage</th><th>Sent</th><th></th></tr></thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.name}>
                  <td className="td-name">{p.name}</td><td className="td-company">{p.co}</td>
                  <td><StageBadge stage={p.stage} /></td><td>{p.sent}</td>
                  <td><span className="card-action" onClick={() => addToast(`Opened: ${p.name}`)}>View →</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'sequences' && (
        <div className="card">
          <div className="card-header"><div className="card-title">All Sequences</div><div className="card-action" onClick={() => addToast('Sequence builder — coming soon')}>+ Create</div></div>
          <div className="sequence-list">
            {sequences.map(s => (
              <div key={s.n} className="sequence-step" style={{ cursor:'pointer' }} onClick={() => addToast(`Opened: ${s.name}`)}>
                <span className="seq-num">{s.n}</span><span className={`seq-type ${s.cls}`}>{s.type}</span>
                <span className="seq-name">{s.name}</span><span className="seq-delay">{s.day}</span><span className="seq-stat">{s.stat}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
