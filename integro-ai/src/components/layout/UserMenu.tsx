import { useEffect, useRef } from 'react'
import type { User } from '../../types'

interface Props {
  user: User
  onNavigate: (view: string) => void
  onLogout: () => void
  onClose: () => void
}

const MENU_ITEMS = [
  { id: 'profile',      icon: '👤', label: 'Profile' },
  { id: 'settings',     icon: '⚙️',  label: 'Settings' },
  { id: 'academy',      icon: '🎓', label: 'Academy' },
  { id: 'connections',  icon: '🔌', label: 'Connections' },
]

export default function UserMenu({ user, onNavigate, onLogout, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const handleItem = (id: string) => {
    if (id === 'connections') { onNavigate('integrations'); onClose(); return }
    if (id === 'settings')    { onNavigate('team');         onClose(); return }
    onNavigate(id)
    onClose()
  }

  return (
    <div className="user-menu" ref={ref}>
      <div className="user-menu-header">
        <div className="user-menu-avatar">{user.initials}</div>
        <div>
          <div className="user-menu-name">{user.name}</div>
          <div className="user-menu-role">{user.role} · {user.org}</div>
        </div>
      </div>

      <div className="user-menu-divider" />

      {MENU_ITEMS.map(item => (
        <button key={item.id} className="user-menu-item" onClick={() => handleItem(item.id)}>
          <span className="user-menu-icon">{item.icon}</span>
          {item.label}
        </button>
      ))}

      <div className="user-menu-divider" />

      <button className="user-menu-item user-menu-signout" onClick={() => { onLogout(); onClose() }}>
        <span className="user-menu-icon">→</span>
        Sign out
      </button>
    </div>
  )
}
