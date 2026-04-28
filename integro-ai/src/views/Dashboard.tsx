import { useState, useEffect, useRef } from 'react'
import StatCard from '../components/ui/StatCard'
import AgentPill from '../components/ui/AgentPill'
import type { SharedViewProps, ActivityItem, Approval } from '../types'

const BASE_ACTIVITY: ActivityItem[] = [
  { id:1, color:'#d4501a', agent:'Outbound',   text:'enrolled 12 new leads from TechTarget into Sequence #4', time:'4 min ago' },
  { id:2, color:'#3ecf8e', agent:'Outbound',   text:'booked meeting — Sarah Chen, VP Sales at Synapse.io',    time:'18 min ago' },
  { id:3, color:'#4d9de0', agent:'CS Engine',  text:'flagged Orbit Analytics as churn risk — usage down 42%', time:'1 hr ago' },
  { id:4, color:'#f5a623', agent:'Demand Gen', text:'routed 4 MQLs from "2025 SaaS Metrics" blog post',       time:'2 hrs ago' },
  { id:5, color:'#9b59b6', agent:'Playbooks',  text:'generated win pattern — fast closes share 3 traits',     time:'3 hrs ago' },
  { id:6, color:'#4d9de0', agent:'CS Engine',  text:'identified $18K expansion opportunity at MomentumHQ',   time:'5 hrs ago' },
]
const LIVE_EVENTS = [
  { color:'#3ecf8e', agent:'Outbound',   text:'sent personalized email to 8 new fintech prospects' },
  { color:'#d4501a', agent:'Outbound',   text:'Marcus Webb requested a product demo' },
  { color:'#f5a623', agent:'Demand Gen', text:'new MQL scored 91 — Alex Fontaine routed to Outbound' },
  { color:'#9b59b6', agent:'Playbooks',  text:'updated Mid-Market ICP playbook with 2 new signals' },
  { color:'#4d9de0', agent:'CS Engine',  text:'sent QBR prep summary to MomentumHQ account team' },
]
const INIT_APPROVALS: Approval[] = [
  { id:'a1', title:'Launch Sequence #7',          desc:'Targeting 45 fintech CTOs — review before activation' },
  { id:'a2', title:'CS Outreach — Orbit Analytics', desc:'Draft rescue email ready — needs strategist review' },
  { id:'a3', title:'New Playbook Draft',           desc:'Mid-market ICP playbook ready for strategist sign-off' },
]

export default function Dashboard({ active, onNavigate, agentStates, addToast }: SharedViewProps & { onNavigate: (v: string) => void }) {
  const [approvals, setApprovals] = useState<Approval[]>(INIT_APPROVALS)
  const [activity, setActivity] = useState<ActivityItem[]>(BASE_ACTIVITY)
  const liveIdx = useRef(0)

  useEffect(() => {
    if (!active) return
    const t = setInterval(() => {
      const evt = LIVE_EVENTS[liveIdx.current % LIVE_EVENTS.length]
      liveIdx.current++
      setActivity(prev => [{ ...evt, id: Date.now(), time: 'just now' }, ...prev.slice(0, 6)])
    }, 13000)
    return () => clearInterval(t)
  }, [active])

  const agentCards = [
    { id:'outbound',       num:'01', name:'Outbound Sales Machine',   desc:'Prospecting, sequencing, and meeting booking — fully automated.', metrics:[{v:'284',l:'In Sequence'},{v:'23%',l:'Reply Rate'},{v:'12',l:'Meetings'}],           last:'4 min ago' },
    { id:'demand',         num:'02', name:'Demand Generation',         desc:'Inbound pipeline, content signals, and MQL routing.',             metrics:[{v:'1.2K',l:'Monthly Visitors'},{v:'38',l:'MQLs'},{v:'$4.2K',l:'CAC'}],              last:'22 min ago' },
    { id:'success',        num:'03', name:'Customer Success Engine',   desc:'Health monitoring, churn risk flagging, and expansion tracking.',  metrics:[{v:'64',l:'Active Accounts'},{v:'3',l:'At Risk'},{v:'$94K',l:'Expansion'}],          last:'1 hr ago' },
    { id:'playbook-agent', num:'04', name:'SaaS Growth Playbooks',     desc:'Win/loss analysis, coaching signals, and playbook generation.',    metrics:[{v:'8',l:'Playbooks'},{v:'71%',l:'Win Rate'},{v:'4',l:'New Insights'}],             last:'3 hrs ago' },
  ]

  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="view-header">
        <div>
          <div className="view-subtitle">Week of Apr 27, 2026</div>
          <h1 className="display view-title">Revenue OS</h1>
        </div>
        <div className="view-actions">
          <button className="btn-sm btn-sm-ghost" onClick={() => addToast('Report exported ✓')}>Export Report</button>
          <button className="btn-sm btn-sm-primary">+ New Task</button>
        </div>
      </div>
      <div className="stats-row">
        {[
          { label:'Pipeline Value',   value:'842', prefix:'$', unit:'K', delta:'↑ 18% vs last month', deltaType:'delta-up'   as const, spark:[4,5,4.5,6,5.5,7.5,9,10] },
          { label:'Sequences Active', value:'47',                        delta:'↑ 6 this week',       deltaType:'delta-up'   as const, spark:[5,5,6,7,7,8,9,10] },
          { label:'Avg Health Score', value:'78',              unit:'%', delta:'→ Stable',            deltaType:'delta-flat' as const, spark:[7,8,7.5,8,7.8,8,7.9,8] },
          { label:'Meetings Booked',  value:'12',                        delta:'↑ 3 this week',       deltaType:'delta-up'   as const, spark:[2,3,3,4,5,6,7,10] },
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
              {a.metrics.map(m => (
                <div key={m.l} className="agent-metric">
                  <div className="agent-metric-val">{m.v}</div>
                  <div className="agent-metric-label">{m.l}</div>
                </div>
              ))}
            </div>
            <div className="agent-card-footer">
              <span className="agent-last-run">Last action: {a.last}</span>
              <span className="agent-open-link">Open →</span>
            </div>
          </div>
        ))}
      </div>
      <div className="grid-2-1" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Live Activity</div>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:'#3ecf8e', animation:'agentPulse 2s ease-in-out infinite' }} />
              <span className="mono" style={{ fontSize:9, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--ink-l)' }}>Live</span>
            </div>
          </div>
          <div className="activity-list">
            {activity.slice(0,6).map((item, i) => (
              <div key={item.id} className="activity-item" style={{ animation: i===0 ? 'fadeUp 0.35s ease forwards' : 'none' }}>
                <div className="activity-dot-wrap"><div className="activity-dot" style={{ background: item.color }} /></div>
                <div className="activity-body">
                  <div className="activity-text"><strong>{item.agent}</strong> {item.text}</div>
                  <div className="activity-time">{item.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Needs Approval</div>
            {approvals.length > 0 && <span className="agent-pill pill-paused" style={{ fontSize:9 }}>{approvals.length} Pending</span>}
          </div>
          {approvals.length === 0 ? (
            <div style={{ textAlign:'center', padding:'28px 16px', color:'var(--ink-l)' }}>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:36, color:'#3ecf8e', marginBottom:4 }}>✓</div>
              <div style={{ fontSize:13 }}>All caught up!</div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {approvals.map(a => (
                <div key={a.id} className="approval-item">
                  <div style={{ fontSize:11, fontWeight:500, marginBottom:3 }}>{a.title}</div>
                  <div style={{ fontSize:11, color:'var(--ink-l)', marginBottom:10 }}>{a.desc}</div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button className="btn-sm btn-sm-primary" style={{ fontSize:11, padding:'5px 14px' }} onClick={() => { setApprovals(p=>p.filter(x=>x.id!==a.id)); addToast('Approved ✓') }}>Approve</button>
                    <button className="btn-sm btn-sm-ghost"   style={{ fontSize:11, padding:'5px 14px' }} onClick={() => setApprovals(p=>p.filter(x=>x.id!==a.id))}>Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
