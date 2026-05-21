import type { User } from '../types'
import { Icon } from '../components/ui/Icon'

interface Props { active: boolean; addToast: (m: string) => void; user: User }

export default function TeamView({ active, addToast, user }: Props) {
  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="view-header">
        <div><div className="view-subtitle">Access Control</div><h1 className="display view-title">Team</h1></div>
        <div className="view-actions">
          <button className="btn-sm btn-sm-primary" onClick={() => addToast('Invite sent')}>+ Invite Member</button>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">Members (1)</div></div>
        <table className="data-table">
          <thead><tr><th>Member</th><th>Role</th><th>Access</th><th></th></tr></thead>
          <tbody>
            <tr>
              <td>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:30, height:30, borderRadius:'50%', background:'var(--ink)', color:'var(--cream)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Mono',monospace", fontSize:10, flexShrink:0 }}>{user.initials}</div>
                  <span className="td-name">{user.name}</span>
                </div>
              </td>
              <td className="td-company">{user.role}</td>
              <td>
                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, letterSpacing:'0.06em', padding:'2px 8px', borderRadius:'var(--radius-pill)', background:'rgba(212,80,26,0.1)', color:'var(--orange)' }}>Admin</span>
              </td>
              <td>
                <span className="card-action" onClick={() => addToast('Managing your own account — coming soon')} style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                  Manage <Icon name="arrowRight" size={10} />
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        <div style={{ padding:'14px 0 2px', fontSize:12, color:'var(--ink-l)' }}>
          Invite teammates to collaborate — they'll appear here once they accept.
        </div>
      </div>
    </div>
  )
}
