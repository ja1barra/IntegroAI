import { useState } from 'react'
import StatCard from '../components/ui/StatCard'
import AgentPill from '../components/ui/AgentPill'
import StageBadge from '../components/ui/StageBadge'
import HealthRing from '../components/ui/HealthRing'
import type { SharedViewProps, StageKey } from '../types'

const ACCOUNTS = [
  { name:'MomentumHQ',     score:94, status:'healthy'  as StageKey, renewal:'Sep 2026' },
  { name:'Synapse.io',     score:87, status:'healthy'  as StageKey, renewal:'Nov 2026' },
  { name:'PivotHQ',        score:72, status:'risk'     as StageKey, renewal:'Aug 2026' },
  { name:'Orbit Analytics',score:41, status:'churning' as StageKey, renewal:'Jul 2026' },
  { name:'Clearfield AI',  score:81, status:'healthy'  as StageKey, renewal:'Jan 2027' },
]

export default function SuccessView({ active, agentStates, toggleAgent, addToast }: SharedViewProps) {
  const [churnOpen, setChurnOpen] = useState(true)
  const isRunning = agentStates.success === 'running'
  const barColor = (s: number) => s >= 75 ? '#3ecf8e' : s >= 50 ? '#f5a623' : '#e74c3c'
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
          <button className="btn-sm btn-sm-primary">+ Add Account</button>
        </div>
      </div>
      <div className="stats-row">
        {[
          { label:'Active Accounts',   value:'64',                       delta:'↑ 4 new this mo.', deltaType:'delta-up'   as const },
          { label:'Avg Health Score',  value:'78', unit:'%',             delta:'→ Stable',          deltaType:'delta-flat' as const },
          { label:'At-Risk Accounts',  value:'3',                        delta:'↑ 1 this week',     deltaType:'delta-down' as const },
          { label:'Expansion Pipeline',value:'94', prefix:'$', unit:'K', delta:'↑ 12% MoM',        deltaType:'delta-up'   as const },
        ].map(s => <StatCard key={s.label} {...s} active={active} />)}
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="card-header"><div className="card-title">Account Health Overview</div><div className="card-action" onClick={() => addToast('CSV exported ✓')}>Export CSV</div></div>
          <table className="data-table">
            <thead><tr><th>Account</th><th>Health</th><th>Status</th><th>Renewal</th></tr></thead>
            <tbody>
              {ACCOUNTS.map(a => (
                <tr key={a.name} style={{ cursor:'pointer' }} onClick={() => addToast(`Opened: ${a.name}`)}>
                  <td className="td-name">{a.name}</td>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ height:4, width:60, background:'var(--rule)', borderRadius:2, overflow:'hidden' }}>
                        <div style={{ height:'100%', width: active ? `${a.score}%` : '0%', background:barColor(a.score), borderRadius:2, transition:'width 1s ease' }} />
                      </div>
                      <span className="mono" style={{ fontSize:10, color:a.score<50?'#e74c3c':'inherit' }}>{a.score}</span>
                    </div>
                  </td>
                  <td><StageBadge stage={a.status} /></td>
                  <td className="mono" style={{ fontSize:11 }}>{a.renewal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {churnOpen && (
            <div className="card" style={{ borderLeft:'3px solid #e74c3c' }}>
              <div className="card-header">
                <div className="card-title" style={{ color:'#c0392b' }}>⚠ Churn Alert — Orbit Analytics</div>
                <span style={{ cursor:'pointer', color:'var(--ink-l)', fontSize:18, lineHeight:1 }} onClick={() => setChurnOpen(false)}>×</span>
              </div>
              <p style={{ fontSize:12, color:'var(--ink-m)', lineHeight:1.6, marginBottom:14 }}>Usage dropped 42% in 14 days. Last login <strong>11 days ago</strong>. Renewal in <strong>47 days</strong>.</p>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn-sm btn-sm-primary" onClick={() => { setChurnOpen(false); addToast('Rescue email sent ✓') }}>Send Rescue Email</button>
                <button className="btn-sm btn-sm-ghost" onClick={() => addToast('EBR link sent ✓')}>Book EBR</button>
              </div>
            </div>
          )}
          <div className="card">
            <div className="card-header"><div className="card-title">Expansion Opportunities</div><span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--orange)' }}>$94K</span></div>
            {[['MomentumHQ','Seat expansion — 8 new users','$24K'],['Synapse.io','Upgrade to Full OS tier','$38K'],['Clearfield AI','Add Playbooks agent','$32K']].map(([co,desc,val]) => (
              <div key={co} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,0.3)', cursor:'pointer' }} onClick={() => addToast(`Opened expansion: ${co}`)}>
                <div><div style={{ fontSize:12, fontWeight:500 }}>{co}</div><div style={{ fontSize:11, color:'var(--ink-l)' }}>{desc}</div></div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:'var(--orange)' }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {[{name:'MomentumHQ',score:94},{name:'Synapse.io',score:87}].map(({name,score}) => (
              <div key={name} className="card">
                <div style={{ fontSize:11, fontWeight:500, marginBottom:12 }}>{name}</div>
                <div className="health-ring-wrap">
                  {active && <HealthRing score={score} size={72} />}
                  <div className="health-details">
                    <div className="health-detail-row"><span className="health-detail-label">Usage</span><span className="health-detail-val" style={{ color:'#3ecf8e' }}>↑ 12%</span></div>
                    <div className="health-detail-row"><span className="health-detail-label">NPS</span><span className="health-detail-val">+72</span></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
