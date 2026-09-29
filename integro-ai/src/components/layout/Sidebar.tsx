import { useState } from 'react'
import type { AgentId, AgentStates, User } from '../../types'
import UserMenu from './UserMenu'
import Avatar from '../ui/Avatar'
import { Icon } from '../ui/Icon'
import type { IconName } from '../ui/Icon'

import { t } from '../../lib/revenue/i18n'

interface Props {
  revenueNav?: boolean
  view: string
  setView: (v: string) => void
  agentStates: AgentStates
  user: User
  onLogout: () => void
  poweredByVisible?: boolean
}

type NavItem = { id: string; icon: IconName; label: string; agent?: boolean; color?: string }

// The "Settings" group has no label and renders in a quieter style, tucked
// above the account footer — Integrations/Team/Settings are account-level
// utilities a user reaches for occasionally, not a workflow they scan daily,
// so they shouldn't compete visually with Workspace/Agents.
const NAV_GROUPS: { label?: string; quiet?: boolean; items: NavItem[] }[] = [
  { label: 'Workspace', items: [
    { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
    { id: 'tasks',     icon: 'tasks',     label: 'Tasks' },
    { id: 'reports',   icon: 'reports',   label: 'Reports' },
  ]},
  { label: 'Agents', items: [
    { id: 'outbound',       icon: 'outbound',        label: 'Outbound Sales',   agent: true, color: '#3ecf8e' },
    { id: 'demand',         icon: 'demandGen',       label: 'Demand Gen',       agent: true, color: '#f5a623' },
    { id: 'success',        icon: 'customerSuccess', label: 'Customer Success', agent: true, color: '#4d9de0' },
    { id: 'playbook-agent', icon: 'openBook',         label: 'Growth Playbooks', agent: true, color: '#9b59b6' },
  ]},
  { quiet: true, items: [
    { id: 'integrations', icon: 'integrations', label: 'Integrations' },
    { id: 'team',         icon: 'team',         label: 'Team' },
    { id: 'settings',     icon: 'settings',     label: 'Settings' },
  ]},
]

// Navigation for workspaces switched to Revenue Manager. The AI Provider /
// client keys / models, SDR agents and sequences are intentionally absent.
const REVENUE_NAV_GROUPS: { label?: string; quiet?: boolean; items: NavItem[] }[] = [
  { label: t('group.revenue'), items: [
    { id: 'rv-overview', icon: 'dashboard',       label: t('nav.overview') },
    { id: 'rv-doctor',   icon: 'healthScore',     label: t('nav.doctor') },
    { id: 'rv-deals',    icon: 'pipeline',        label: t('nav.deals') },
    { id: 'rv-brief',    icon: 'openBook',        label: t('nav.brief') },
    { id: 'rv-ask',      icon: 'sparkles',        label: t('nav.ask') },
    { id: 'rv-actions',  icon: 'approvals',       label: t('nav.actions') },
  ]},
  { quiet: true, items: [
    { id: 'rv-settings', icon: 'integrations', label: t('nav.integrations') },
    { id: 'team',        icon: 'team',         label: 'Team' },
    { id: 'settings',    icon: 'settings',     label: 'Settings' },
  ]},
]

export default function Sidebar({ view, setView, agentStates, user, onLogout, poweredByVisible, revenueNav }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const groups = revenueNav ? REVENUE_NAV_GROUPS : NAV_GROUPS

  return (
    <>
      {revenueNav && (
        // The sidebar is hidden below 900px; keep Revenue Manager reachable on phones.
        <nav className="rv-mobile-nav" aria-label="Revenue Manager">
          {REVENUE_NAV_GROUPS.flatMap(g => g.items).filter(i => i.id.startsWith('rv-')).map(item => (
            <button key={item.id} className={view === item.id ? 'is-active' : ''} aria-current={view === item.id ? 'page' : undefined} onClick={() => setView(item.id)}>
              <Icon name={item.icon} size={16} /><span>{item.label}</span>
            </button>
          ))}
        </nav>
      )}
    <aside className="sidebar">
      {groups.map((g, i) => (
        <div key={g.label ?? `group-${i}`} className={`sidebar-section ${g.quiet ? 'sidebar-section-quiet' : ''}`}>
          {g.label && <div className="sidebar-label">{g.label}</div>}
          {g.items.map(item => (
            <div
              key={item.id}
              className={`sidebar-nav-item ${view === item.id ? 'active' : ''}`}
              role="button"
              tabIndex={0}
              aria-current={view === item.id ? 'page' : undefined}
              onClick={() => setView(item.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setView(item.id) } }}
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

      {poweredByVisible && (
        <div style={{ padding: '10px 12px 0', textAlign: 'center' }}>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 8.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink-l)', opacity: 0.6 }}>
            Powered by Integro AI
          </span>
        </div>
      )}

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
          <Avatar user={user} className="sidebar-avatar" />
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
    </>
  )
}
