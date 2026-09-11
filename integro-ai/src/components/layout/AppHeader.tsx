import type { User } from '../../types'
import { Icon } from '../ui/Icon'
import IntegroLogo from '../ui/IntegroLogo'

interface Props {
  user: User
  onToggleNotif: () => void
  notifOpen: boolean
  children?: React.ReactNode
  logoUrl?: string | null
  poweredByVisible?: boolean
}

export default function AppHeader({ user, onToggleNotif, notifOpen, children, logoUrl, poweredByVisible = true }: Props) {
  return (
    <header className="app-header">
      {logoUrl ? (
        <img src={logoUrl} alt="" style={{ height: 22, maxWidth: 160, objectFit: 'contain' }} />
      ) : (
        <div className="app-logo">INTEGRO AI <span className="brand-tag">Beta</span></div>
      )}
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

        {poweredByVisible && (
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
        )}
      </div>
    </header>
  )
}
