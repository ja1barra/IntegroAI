import { useState } from 'react'
import EmptyState from '../components/ui/EmptyState'

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
          <button className="btn-sm btn-sm-ghost" onClick={() => addToast('No data to export yet')}>Export</button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
        {['Revenue Generated','Pipeline Created','Meetings Booked','Avg Deal Cycle','MQLs Generated','Customer Acq. Cost'].map(label => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, lineHeight:1, color:'var(--ink-l)', margin:'8px 0' }}>--</div>
            <div className="stat-delta" style={{ color:'var(--ink-l)' }}>No data connected</div>
          </div>
        ))}
      </div>

      <div className="card">
        <EmptyState
          icon="reports"
          title="No report data yet"
          desc={`Connect your CRM and tools to start seeing ${range} performance reports across pipeline, meetings, MQLs, and more.`}
          action={{ label: 'Connect Integrations', onClick: () => addToast('Go to Integrations in the sidebar') }}
        />
      </div>
    </div>
  )
}
