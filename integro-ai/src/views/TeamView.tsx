import StageBadge from '../components/ui/StageBadge'
import type { StageKey } from '../types'

const TEAM = [
  { name:'Jay Rodriguez', role:'Revenue Strategist', initials:'JR', access:'Admin',  status:'healthy'  as StageKey },
  { name:'Sarah Kim',     role:'Outbound SDR',        initials:'SK', access:'Editor', status:'healthy'  as StageKey },
  { name:'Marcus Chen',   role:'CS Manager',          initials:'MC', access:'Editor', status:'healthy'  as StageKey },
  { name:'Priya Nair',    role:'Demand Gen Lead',     initials:'PN', access:'Viewer', status:'healthy'  as StageKey },
  { name:'Alex Torres',   role:'RevOps Analyst',      initials:'AT', access:'Viewer', status:'contacted' as StageKey },
]

export default function TeamView({ active, addToast }: { active: boolean; addToast: (m: string) => void }) {
  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="view-header">
        <div><div className="view-subtitle">Access Control</div><h1 className="display view-title">Team</h1></div>
        <div className="view-actions">
          <button className="btn-sm btn-sm-primary" onClick={() => addToast('Invite sent ✓')}>+ Invite Member</button>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">Members ({TEAM.length})</div></div>
        <table className="data-table">
          <thead><tr><th>Member</th><th>Role</th><th>Access</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {TEAM.map(m => (
              <tr key={m.name}>
                <td>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:30, height:30, borderRadius:'50%', background:'var(--ink)', color:'var(--cream)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Mono',monospace", fontSize:10, flexShrink:0 }}>{m.initials}</div>
                    <span className="td-name">{m.name}</span>
                  </div>
                </td>
                <td className="td-company">{m.role}</td>
                <td><span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, letterSpacing:'0.06em', padding:'2px 8px', borderRadius:'var(--radius-pill)', background:m.access==='Admin'?'rgba(212,80,26,0.1)':'var(--cream-d)', color:m.access==='Admin'?'var(--orange)':'var(--ink-l)' }}>{m.access}</span></td>
                <td><StageBadge stage={m.status} /></td>
                <td><span className="card-action" onClick={() => addToast(`Manage ${m.name} — coming soon`)}>Manage →</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
