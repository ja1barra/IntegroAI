import { useState } from 'react'
import type { AgentId, AgentStates, User } from '../../types'
import UserMenu from './UserMenu'
import { Icon } from '../ui/Icon'
import type { IconName } from '../ui/Icon'

interface Props {
  view: string
  setView: (v: string) => void
  agentStates: AgentStates
  user: User
  onLogout: () => void
}

type NavItem = { id: string; icon: IconName; label: string; agent?: boolean; color?: string }

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: 'Overview', items: [
    { id: 'dashboard',      icon: 'dashboard',       label: 'Dashboard' },
    { id: 'tasks',          icon: 'tasks',           label: 'Tasks' },
    { id: 'playbooks',      icon: 'playbook',        label: 'Playbooks' },
    { id: 'reports',        icon: 'reports',         label: 'Reports' },
  ]},
  { label: 'Agents', items: [
    { id: 'outbound',       icon: 'outbound',        label: 'Outbound Sales',   agent: true, color: '#3ecf8e' },
    { id: 'demand',         icon: 'demandGen',       label: 'Demand Gen',       agent: true, color: '#f5a623' },
    { id: 'success',        icon: 'customerSuccess', label: 'Customer Success', agent: true, color: '#4d9de0' },
    { id: 'playbook-agent', icon: 'agents',          label: 'Growth Playbooks', agent: true, color: '#9b59b6' },
  ]},
  { label: 'Settings', items: [
    { id: 'integrations', icon: 'integrations', label: 'Integrations' },
    { id: 'team',         icon: 'team',         label: 'Team' },
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
              <span className="nav-icon"><Icon name={item.icon} size={15} /></span>
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
            direction="up"
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
            display: 'inline-flex',
            alignItems: 'center',
          }}>
            <Icon name="chevronDown" size={11} />
          </span>
        </div>
      </div>
    </aside>
  )
}
