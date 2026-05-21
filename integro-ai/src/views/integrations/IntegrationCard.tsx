import type { IntegrationStatus } from '../../lib/integrations/types'

export interface IntegrationCardProps {
  id: string
  name: string
  description: string
  logo: string
  logoColor: string
  tags: string[]
  status: IntegrationStatus
  lastSync?: string
  recordCount?: number
  onClick: () => void
  selected?: boolean
  compact?: boolean
}

const STATUS_CONFIG: Record<IntegrationStatus, { label: string; bg: string; color: string; border: string }> = {
  connected:  { label: 'Connected',    bg: '#eaf5ee', color: '#2a7d4f', border: 'rgba(42,125,79,0.25)' },
  error:      { label: 'Auth Expired', bg: '#fdecea', color: '#c0392b', border: 'rgba(192,57,43,0.25)' },
  configure:  { label: 'Configure',    bg: '#fff4e0', color: '#8a5000', border: 'rgba(138,80,0,0.25)' },
  available:  { label: 'Available',    bg: 'rgba(122,114,104,0.10)', color: 'var(--ink-l)', border: 'rgba(122,114,104,0.20)' },
}

export default function IntegrationCard({
  name, description, logo, logoColor, tags, status, lastSync, recordCount, onClick, selected, compact,
}: IntegrationCardProps) {
  const badge = STATUS_CONFIG[status]

  const cardStyle: React.CSSProperties = {
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
    borderColor: selected ? 'var(--orange)' : undefined,
    borderWidth: selected ? '1.5px' : undefined,
    boxShadow: selected
      ? '0 0 0 3px rgba(212,80,26,0.12), var(--glass-shadow)'
      : undefined,
    position: 'relative',
  }

  if (compact) {
    return (
      <div
        className="card"
        style={{ ...cardStyle, padding: '14px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}
        onClick={onClick}
      >
        <div style={{ width: 40, height: 40, borderRadius: 10, background: logoColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: '0.05em' }}>{logo}</span>
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>{name}</div>
        {status !== 'available' && (
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 100, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
            {badge.label}
          </span>
        )}
        {status === 'available' && (
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--orange)', cursor: 'pointer' }}>
            Connect →
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="card" style={cardStyle} onClick={onClick}>
      {selected && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,var(--orange),rgba(212,80,26,0.4))', borderRadius: '13px 13px 0 0' }} />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: logoColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '0.05em' }}>{logo}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{name}</span>
            <span style={{
              fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.07em', textTransform: 'uppercase',
              padding: '2px 8px', borderRadius: 100, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`,
              flexShrink: 0,
            }}>
              {badge.label}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-l)', lineHeight: 1.4 }}>{description}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {tags.map(tag => (
          <span key={tag} style={{
            fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.07em', textTransform: 'uppercase',
            padding: '2px 8px', borderRadius: 100,
            background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.6)', color: 'var(--ink-l)',
          }}>
            {tag}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.40)' }}>
        <div>
          {lastSync && status === 'connected' && (
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: 'var(--ink-l)' }}>
              Synced {lastSync}
              {recordCount !== undefined && ` · ${recordCount.toLocaleString()} records`}
            </span>
          )}
          {status === 'error' && (
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: '#c0392b' }}>
              ⚠ Auth expired — reconnect required
            </span>
          )}
          {status === 'configure' && (
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: 'var(--ink-l)' }}>
              Not connected
            </span>
          )}
        </div>
        <span style={{
          fontFamily: "'DM Mono',monospace", fontSize: 10, letterSpacing: '0.07em', textTransform: 'uppercase',
          color: 'var(--orange)', cursor: 'pointer',
        }}>
          {status === 'connected' || status === 'error' ? 'Configure →' : 'Connect →'}
        </span>
      </div>
    </div>
  )
}
