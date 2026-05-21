import { useState } from 'react'
import type { User } from '../../types'
import UserMenu from './UserMenu'
import { Icon } from '../ui/Icon'

interface Props {
  user: User
  onLogout: () => void
  onNavigate: (v: string) => void
  onToggleNotif: () => void
  notifOpen: boolean
  children?: React.ReactNode
}

export default function AppHeader({ user, onLogout, onNavigate, onToggleNotif, notifOpen, children }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="app-header">
      <div className="app-logo">INTEGRO AI <span className="brand-tag">Beta</span></div>
      <div className="header-sep" />
      <span className="header-org">{user.org}</span>
      <div className="header-right">
        <div style={{ position: 'relative' }}>
          <div className="header-notif" onClick={e => { e.stopPropagation(); onToggleNotif() }}>
            <Icon name="alert" size={16} />
            <div className="notif-badge" />
          </div>
          {notifOpen && children}
        </div>

        <div style={{ position: 'relative' }}>
          <div
            className="header-avatar"
            title="Account"
            onClick={e => { e.stopPropagation(); setMenuOpen(p => !p) }}
          >
            {user.initials}
          </div>
          {menuOpen && (
            <UserMenu
              user={user}
              onNavigate={v => { onNavigate(v); setMenuOpen(false) }}
              onLogout={onLogout}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>
    </header>
  )
}
