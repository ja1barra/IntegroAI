import type { User } from '../../types'
import { Icon } from '../ui/Icon'
import IntegroLogo from '../ui/IntegroLogo'

interface Props {
  user: User
  onToggleNotif: () => void
  notifOpen: boolean
  children?: React.ReactNode
}

export default function AppHeader({ user, onToggleNotif, notifOpen, children }: Props) {
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

        <a
          href="https://getintegro.com"
          target="_blank"
          rel="noreferrer"
          className="header-avatar"
          title="Integro Solutions"
          style={{ padding: 0, overflow: 'hidden' }}
        >
          <IntegroLogo size={34} />
        </a>
      </div>
    </header>
  )
}
