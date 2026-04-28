import { useState } from 'react'
import StatCard from '../components/ui/StatCard'
import AgentPill from '../components/ui/AgentPill'
import SparkBars from '../components/ui/SparkBars'
import type { SharedViewProps } from '../types'

interface MQL { id: string; name: string; source: string; score: number }

export default function DemandView({ active, agentStates, toggleAgent, addToast }: SharedViewProps) {
  const [mqls, setMqls] = useState<MQL[]>([
    { id:'m1', name:'Alex Fontaine',  source:'Blog',        score:94 },
    { id:'m2', name:'Kenji Watanabe', source:'LinkedIn Ad', score:88 },
    { id:'m3', name:'Mia Okonkwo',    source:'Webinar',     score:76 },
    { id:'m4', name:'Luis Ferreira',  source:'Organic',     score:71 },
  ])
  const isRunning = agentStates.demand === 'running'
  const route = (id: string, name: string) => { setMqls(p => p.filter(m => m.id !== id)); addToast(`${name} routed to Outbound ✓`) }
  const routeAll = () => { const n = mqls.length; setMqls([]); addToast(`${n} MQLs routed to Outbound ✓`) }
  const channels = [
    { name:'Organic Search', mqls:16, data:[3,4.5,5.5,7,8,10] },
    { name:'LinkedIn Ads',   mqls:11, data:[4,5,4,6.5,7.5,8.5] },
    { name:'Webinars',       mqls:7,  data:[2,0,6,1,0,8] },
    { name:'Referral',       mqls:4,  data:[2.5,3.5,2,3,4.5,5.5] },
  ]
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
          { label:'Monthly Visitors',      value:'1.2', unit:'K', delta:'↑ 22% MoM',       deltaType:'delta-up'   as const },
          { label:'MQLs This Month',       value:'38',             delta:'↑ 8 vs last',     deltaType:'delta-up'   as const },
          { label:'CAC',                   value:'4.2', prefix:'$', unit:'K', delta:'↓ $400 vs target', deltaType:'delta-down' as const },
          { label:'Pipeline from Inbound', value:'310', prefix:'$', unit:'K', delta:'↑ 31% MoM', deltaType:'delta-up' as const },
        ].map(s => <StatCard key={s.label} {...s} active={active} />)}
      </div>
      <div className="grid-2" style={{ marginBottom:12 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">Top Content by MQL Attribution</div></div>
          <table className="data-table">
            <thead><tr><th>Content</th><th>Views</th><th>MQLs</th><th>Conv.</th></tr></thead>
            <tbody>
              {[['2025 SaaS Metrics Benchmark','1,240',14,'1.1%'],['Outbound Playbook Guide','870',9,'1.0%'],['CS Health Score Template','640',7,'1.1%'],['SaaS Revenue OS Overview','520',5,'1.0%'],['Churn Prevention Checklist','410',3,'0.7%']].map(([c,v,m,r]) => (
                <tr key={c}><td className="td-name">{c}</td><td>{v}</td><td>{m}</td><td>{r}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-title">MQL Queue</div>
            {mqls.length > 0 && <button className="btn-sm btn-sm-primary" style={{ fontSize:11, padding:'4px 10px' }} onClick={routeAll}>Route All ({mqls.length})</button>}
          </div>
          {mqls.length === 0 ? (
            <div style={{ textAlign:'center', padding:'28px 0', color:'var(--ink-l)' }}>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, color:'#3ecf8e', marginBottom:4 }}>✓</div>
              <div style={{ fontSize:13 }}>Queue empty — all routed</div>
            </div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Lead</th><th>Source</th><th>Score</th><th></th></tr></thead>
              <tbody>
                {mqls.map(m => (
                  <tr key={m.id}>
                    <td className="td-name">{m.name}</td><td>{m.source}</td>
                    <td><strong style={{ color: m.score >= 85 ? 'var(--orange)' : 'var(--ink)' }}>{m.score}</strong></td>
                    <td><span className="card-action" onClick={() => route(m.id, m.name)}>Route →</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">Channel Performance — Last 30 Days</div></div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:2, background:'var(--rule)', borderRadius:'var(--radius-sm)', overflow:'hidden' }}>
          {channels.map(ch => (
            <div key={ch.name} style={{ background:'var(--glass)', backdropFilter:'var(--glass-blur)', padding:'16px 18px' }}>
              <div className="mono" style={{ fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--ink-l)', marginBottom:10 }}>{ch.name}</div>
              <SparkBars data={ch.data} animate={active} />
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, lineHeight:1, color:'var(--ink)' }}>{ch.mqls} <span style={{ fontSize:15, color:'var(--ink-l)', fontFamily:"'DM Mono',monospace" }}>MQLs</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
