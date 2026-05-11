import { useState } from 'react'
import type { AgentId, AgentStates, User } from '../../types'
import UserMenu from './UserMenu'

interface Props {
  view: string
  setView: (v: string) => void
  agentStates: AgentStates
  user: User
  onLogout: () => void
}

type NavItem = { id: string; icon: string; label: string; agent?: boolean; color?: string }

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
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
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <aside className="sidebar">
      {NAV_GROUPS.map(g => (
        <div key={g.label} className="sidebar-section">
          <div className="sidebar-label">{g.label}</div>
          {g.items.map(item => (
            <div
              key={item.id}
              className={`sidebar-nav-item ${view === item.id ? 'active' : ''}`}
              onClick={() => setView(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
              {item.agent && (
                <div className="sidebar-agent-dot" style={{
                  background: agentStates[item.id as AgentId] === 'running' ? item.color : 'var(--ink-l)',
                  animation: agentStates[item.id as AgentId] === 'running' ? 'agentPulse 2.4s ease-in-out infinite' : 'none',
                }} />
              )}
            </div>
          ))}
        </div>
      ))}

      <div className="sidebar-footer" style={{ position: 'relative' }}>
        {menuOpen && (
          <UserMenu
            user={user}
            onNavigate={setView}
            onLogout={onLogout}
            onClose={() => setMenuOpen(false)}
          />
        )}
        <div
          className={`sidebar-user ${menuOpen ? 'active' : ''}`}
          onClick={e => { e.stopPropagation(); setMenuOpen(p => !p) }}
        >
          <div className="sidebar-avatar">{user.initials}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user.name}</div>
            <div className="sidebar-user-role">{user.role}</div>
          </div>
          <span className="sidebar-user-chevron" style={{
            transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}>‹</span>
        </div>
      </div>
    </aside>
  )
}
