import { useState } from 'react'
import StatCard from '../components/ui/StatCard'
import AgentPill from '../components/ui/AgentPill'
import type { SharedViewProps } from '../types'

const PLAYBOOKS = [
  { id:'p1', num:'01', name:'Mid-Market ICP Outbound',     winRate:'74%', deals:18, tags:['Cold Outbound','Fintech','SaaS'],  desc:'Targeting mid-market SaaS companies 50–250 employees. Focus on VP Sales + RevOps personas.' },
  { id:'p2', num:'02', name:'Enterprise Champion Building', winRate:'68%', deals:7,  tags:['Enterprise','Multi-thread'],       desc:'Multi-threaded approach for enterprise. Build champion at VP level before engaging C-suite.' },
  { id:'p3', num:'03', name:'Competitive Displacement',     winRate:'61%', deals:12, tags:['Competitive','CRM Displacement'],  desc:'Head-to-head displacement for prospects on legacy CRM. ROI calculator required in follow-up.' },
  { id:'p4', num:'04', name:'Fast-Close SMB Playbook',      winRate:'81%', deals:29, tags:['SMB','Fast-close','Trial-led'],     desc:'Streamlined 14-day close for SMB deals under $20K ARR. Minimal stakeholders, self-serve trial.' },
]
const INSIGHTS = [
  { id:'i1', title:'Fast closes share 3 traits',        desc:'Champion in week 1 · Pricing on call 2 · MAP by day 10' },
  { id:'i2', title:'LinkedIn → email reply boost +18%', desc:'Prospects who accept LinkedIn before email step 1 reply 18% more.' },
  { id:'i3', title:'Fintech peaks Tues/Wed 9–11am',     desc:'Based on 90 days of data across 847 contacts.' },
  { id:'i4', title:'ROI framing lifts win rate +11pts', desc:'ROI calculator in follow-up raised win rate from 53% → 64%.' },
]

export default function PlaybookAgentView({ active, agentStates, toggleAgent, addToast }: SharedViewProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<string[]>([])
  const isRunning = agentStates['playbook-agent'] === 'running'
  const activeInsights = INSIGHTS.filter(i => !dismissed.includes(i.id))
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
          { label:'Active Playbooks', value:'8',  delta:'↑ 2 this month',   deltaType:'delta-up'   as const },
          { label:'Win Rate',         value:'71', unit:'%', delta:'↑ 6pts vs Q1', deltaType:'delta-up' as const },
          { label:'Avg Deal Cycle',   value:'18', unit:'d', delta:'↓ 4 days faster', deltaType:'delta-up' as const },
          { label:'New Insights',     value:'4',  delta:'This week',         deltaType:'delta-flat' as const },
        ].map(s => <StatCard key={s.label} {...s} active={active} />)}
      </div>
      <div className="grid-1-2">
        <div className="card" style={{ alignSelf:'start' }}>
          <div className="card-header">
            <div className="card-title">New Insights</div>
            {activeInsights.length > 0 && <span className="agent-pill pill-paused" style={{ fontSize:9 }}>{activeInsights.length} New</span>}
          </div>
          {activeInsights.length === 0
            ? <div style={{ textAlign:'center', padding:'20px 0', color:'var(--ink-l)', fontSize:12 }}>All insights reviewed ✓</div>
            : activeInsights.map(ins => (
              <div key={ins.id} style={{ padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,0.3)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                  <div style={{ fontSize:11, fontWeight:500, flex:1, lineHeight:1.4 }}>{ins.title}</div>
                  <span style={{ cursor:'pointer', color:'var(--ink-l)', marginLeft:8, fontSize:16, lineHeight:1 }} onClick={() => setDismissed(p=>[...p,ins.id])}>×</span>
                </div>
                <div style={{ fontSize:11, color:'var(--ink-l)', lineHeight:1.5 }}>{ins.desc}</div>
              </div>
            ))
          }
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Active Playbooks</div><div className="card-action" onClick={() => addToast('Builder — coming soon')}>Create New</div></div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {PLAYBOOKS.map(pb => (
              <div key={pb.id}>
                <div style={{ display:'flex', alignItems:'center', gap:12, padding:12, background:'rgba(255,255,255,0.3)', borderRadius:'var(--radius-sm)', cursor:'pointer', border:'1px solid rgba(255,255,255,0.45)', transition:'all 0.15s' }}
                  onClick={() => setExpanded(expanded===pb.id ? null : pb.id)}>
                  <div style={{ width:36, height:36, borderRadius:'var(--radius-sm)', background:'var(--ink)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Bebas Neue',sans-serif", fontSize:16, color:'var(--orange)', flexShrink:0 }}>{pb.num}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:500 }}>{pb.name}</div>
                    <div style={{ fontSize:11, color:'var(--ink-l)', marginTop:2 }}>Win rate: {pb.winRate} · {pb.deals} deals</div>
                  </div>
                  <span style={{ color:'var(--ink-l)', transition:'transform 0.2s', display:'inline-block', transform:expanded===pb.id?'rotate(180deg)':'rotate(0)' }}>▾</span>
                </div>
                {expanded === pb.id && (
                  <div style={{ padding:'14px 16px', background:'var(--glass)', backdropFilter:'var(--glass-blur)', border:'1px solid rgba(255,255,255,0.4)', borderTop:'none', borderRadius:`0 0 ${10}px ${10}px`, animation:'fadeUp 0.2s ease' }}>
                    <p style={{ fontSize:12, color:'var(--ink-m)', lineHeight:1.65, marginBottom:12 }}>{pb.desc}</p>
                    <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:12 }}>
                      {pb.tags.map(tag => <span key={tag} style={{ fontSize:10, fontFamily:"'DM Mono',monospace", padding:'2px 8px', background:'rgba(255,255,255,0.4)', border:'1px solid rgba(255,255,255,0.5)', borderRadius:'var(--radius-pill)', color:'var(--ink-l)' }}>{tag}</span>)}
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button className="btn-sm btn-sm-ghost" style={{ fontSize:11, padding:'4px 12px' }} onClick={() => addToast(`Opened: ${pb.name}`)}>Open Playbook</button>
                      <button className="btn-sm btn-sm-ghost" style={{ fontSize:11, padding:'4px 12px' }} onClick={() => addToast('Edit mode — coming soon')}>Edit</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
