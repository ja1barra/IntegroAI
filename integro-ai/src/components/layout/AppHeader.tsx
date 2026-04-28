import type { User } from '../../types'

interface Props {
  user: User
  onLogout: () => void
  onToggleNotif: () => void
  notifOpen: boolean
  children?: React.ReactNode
}

export default function AppHeader({ user, onLogout, onToggleNotif, notifOpen, children }: Props) {
  return (
    <header className="app-header">
      <div className="app-logo">INTEGRO AI <span className="brand-tag">Beta</span></div>
      <div className="header-sep" />
      <span className="header-org">{user.org}</span>
      <div className="header-right">
        <div style={{ position: 'relative' }}>
          <div className="header-notif" onClick={e => { e.stopPropagation(); onToggleNotif() }}>
            🔔<div className="notif-badge" />
          </div>
          {notifOpen && children}
        </div>
        <div className="header-avatar" title="Sign out" onClick={onLogout}>{user.initials}</div>
      </div>
    </header>
  )
}
