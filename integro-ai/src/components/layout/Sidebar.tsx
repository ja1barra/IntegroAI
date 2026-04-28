import type { AgentId, AgentStates } from '../../types'
import type { User } from '../../types'

interface Props {
  view: string
  setView: (v: string) => void
  agentStates: AgentStates
  user: User
  onLogout: () => void
}

const NAV_GROUPS = [
  { label: 'Overview', items: [
    { id: 'dashboard',      icon: '⊞', label: 'Dashboard' },
    { id: 'playbooks',      icon: '📋', label: 'Playbooks' },
    { id: 'reports',        icon: '📊', label: 'Reports' },
  ]},
  { label: 'Agents', items: [
    { id: 'outbound',       icon: '⚡', label: 'Outbound Sales',   agent: true, color: '#3ecf8e' },
    { id: 'demand',         icon: '📣', label: 'Demand Gen',       agent: true, color: '#f5a623' },
    { id: 'success',        icon: '💎', label: 'Customer Success', agent: true, color: '#4d9de0' },
    { id: 'playbook-agent', icon: '🧠', label: 'Growth Playbooks', agent: true, color: '#9b59b6' },
  ]},
  { label: 'Settings', items: [
    { id: 'integrations', icon: '🔌', label: 'Integrations' },
    { id: 'team',         icon: '👥', label: 'Team' },
  ]},
]

export default function Sidebar({ view, setView, agentStates, user, onLogout }: Props) {
  return (
    <aside className="sidebar">
      {NAV_GROUPS.map(g => (
        <div key={g.label} className="sidebar-section">
          <div className="sidebar-label">{g.label}</div>
          {g.items.map(item => (
            <div key={item.id} className={`sidebar-nav-item ${view === item.id ? 'active' : ''}`} onClick={() => setView(item.id)}>
              <span className="nav-icon">{item.icon}</span>
              {item.label}
              {item.agent && (
                <div className="sidebar-agent-dot" style={{
                  background: agentStates[item.id as AgentId] === 'running' ? (item as { color: string }).color : 'var(--ink-l)',
                  animation: agentStates[item.id as AgentId] === 'running' ? 'agentPulse 2.4s ease-in-out infinite' : 'none',
                }} />
              )}
            </div>
          ))}
        </div>
      ))}
      <div className="sidebar-footer">
        <div className="sidebar-user" onClick={onLogout}>
          <div className="sidebar-avatar">{user.initials}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user.name}</div>
            <div className="sidebar-user-role">{user.role}</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
