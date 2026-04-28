import { useState } from 'react'

export default function ReportsView({ active, addToast }: { active: boolean; addToast: (m: string) => void }) {
  const [range, setRange] = useState('30d')
  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="view-header">
        <div><div className="view-subtitle">Analytics</div><h1 className="display view-title">Reports</h1></div>
        <div className="view-actions">
          {['7d','30d','90d','YTD'].map(r => (
            <button key={r} className={`btn-sm ${range===r?'btn-sm-primary':'btn-sm-ghost'}`} onClick={() => setRange(r)}>{r}</button>
          ))}
          <button className="btn-sm btn-sm-ghost" onClick={() => addToast('Report exported ✓')}>Export</button>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
        {[['Revenue Generated','$1.24M','+22%'],['Pipeline Created','$842K','+18%'],['Meetings Booked','47','+31%'],['Avg Deal Cycle','18d','−4d'],['MQLs Generated','38','+8'],['Customer Acq. Cost','$4,200','−$400']].map(([label,val,change]) => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, lineHeight:1, color:'var(--ink)', margin:'8px 0' }}>{val}</div>
            <div className="stat-delta delta-up">{change} vs prev period</div>
          </div>
        ))}
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="card-header"><div className="card-title">Pipeline by Agent — {range}</div></div>
          {[['Outbound Sales','$842K',84],['Demand Gen','$310K',31],['CS Expansion','$94K',9]].map(([name,val,pct]) => (
            <div key={name} style={{ marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontSize:12, fontWeight:500 }}>{name}</span>
                <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:'var(--orange)' }}>{val}</span>
              </div>
              <div style={{ height:6, background:'var(--rule)', borderRadius:3, overflow:'hidden' }}>
                <div style={{ height:'100%', width: active ? `${pct}%` : '0%', background:'var(--orange)', borderRadius:3, transition:'width 1.2s ease' }} />
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Win Rate Trend</div></div>
          {[['Q1 2026','65%',65,'var(--orange)'],['Q2 2026 (Apr)','71%',71,'var(--orange)'],['Q3 Target','75%',75,'var(--rule)']].map(([p,v,pct,color]) => (
            <div key={p} style={{ marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontSize:12, color:'var(--ink-l)' }}>{p}</span>
                <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color: color==='var(--rule)'?'var(--ink-l)':'var(--ink)' }}>{v}</span>
              </div>
              <div style={{ height:6, background:'var(--rule)', borderRadius:3, overflow:'hidden' }}>
                <div style={{ height:'100%', width: active ? `${pct}%` : '0%', background:color, borderRadius:3, transition:'width 1.2s ease 0.2s' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
