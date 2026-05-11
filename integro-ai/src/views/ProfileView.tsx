import type { User } from '../types'

interface Props { active: boolean; user: User }

export default function ProfileView({ active, user }: Props) {
  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="view-header">
        <div>
          <div className="view-title">Profile</div>
          <div style={{ color: 'var(--ink-l)', fontSize: 14, marginTop: 4 }}>Manage your account details</div>
        </div>
      </div>

      <div style={{ maxWidth: 560 }}>
        <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 'var(--radius)', border: '1px solid rgba(255,255,255,0.7)', padding: '24px 28px', backdropFilter: 'blur(12px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--ink)', color: '#f5f0e8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontFamily: "'DM Mono',monospace" }}>
              {user.initials}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{user.name}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-l)', marginTop: 2 }}>{user.role} · {user.org}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { label: 'Full Name', value: user.name },
              { label: 'Role', value: user.role },
              { label: 'Organization', value: user.org },
            ].map(field => (
              <div key={field.label}>
                <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 6 }}>{field.label}</div>
                <div style={{ padding: '10px 14px', background: 'rgba(26,23,20,0.04)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(26,23,20,0.08)', fontSize: 14, color: 'var(--ink)' }}>{field.value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24, padding: '12px 16px', background: 'rgba(212,80,26,0.06)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(212,80,26,0.12)', fontSize: 13, color: 'var(--ink-m)' }}>
            Profile editing coming soon — full account management will be available in the next release.
          </div>
        </div>
      </div>
    </div>
  )
}
