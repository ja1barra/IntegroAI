import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Icon } from '../components/ui/Icon'
import Toggle from '../components/ui/Toggle'
import Avatar from '../components/ui/Avatar'
import type { User, Tweaks, AccentColor, ThemeMode, DensityMode, FontFamily } from '../types'

const MAX_AVATAR_BYTES = 5 * 1024 * 1024

interface Props {
  active: boolean
  user: User
  tweaks: Tweaks
  setTweak: (key: keyof Tweaks, value: Tweaks[keyof Tweaks]) => void
  addToast: (m: string, t?: 'success' | 'error') => void
  onLogout: () => void
}

type Tab = 'profile' | 'appearance' | 'white-label' | 'notifications' | 'security'

const TABS: { id: Tab; label: string }[] = [
  { id: 'profile',       label: 'Profile' },
  { id: 'appearance',    label: 'Appearance' },
  { id: 'white-label',   label: 'White Label' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'security',      label: 'Account & Security' },
]

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--ink-l)', marginTop: 3 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

function SegButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="btn-sm"
      style={{
        flex: 1, padding: '8px 0', fontSize: 11, fontFamily: "'DM Mono',monospace",
        border: `1px solid ${active ? 'var(--orange)' : 'var(--rule)'}`,
        borderRadius: 'var(--radius-pill)',
        background: active ? 'var(--orange)' : 'transparent',
        color: active ? '#fff' : 'var(--ink)',
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--rule-m)' }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--ink)' }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--ink-l)', marginTop: 2 }}>{hint}</div>}
      </div>
      {children}
    </div>
  )
}

// ── Profile ──────────────────────────────────────────────────

function ProfileTab({ user, addToast }: { user: User; addToast: Props['addToast'] }) {
  const [name, setName] = useState(user.name)
  const [org, setOrg] = useState(user.org)
  const [role, setRole] = useState(user.role)
  const [email, setEmail] = useState<string | null>(null)
  const [memberSince, setMemberSince] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [emailSaving, setEmailSaving] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(user.name); setOrg(user.org); setRole(user.role)
  }, [user])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null)
      if (data.user?.created_at) {
        setMemberSince(new Date(data.user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }))
      }
    })
  }, [])

  const dirty = name !== user.name || org !== user.org || role !== user.role

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { addToast('Please choose an image file', 'error'); return }
    if (file.size > MAX_AVATAR_BYTES) { addToast('Image must be under 5MB', 'error'); return }

    setPhotoBusy(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { setPhotoBusy(false); return }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${authUser.id}/avatar.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, cacheControl: '3600' })
    if (uploadError) {
      setPhotoBusy(false)
      addToast(uploadError.message, 'error')
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    // Cache-bust so a re-upload to the same path shows immediately instead of
    // the browser's previously cached image at that URL.
    const { error } = await supabase.auth.updateUser({ data: { avatar_url: `${publicUrl}?t=${Date.now()}` } })
    setPhotoBusy(false)
    if (error) addToast(error.message, 'error')
    else addToast('Profile photo updated')
  }

  const handleRemovePhoto = async () => {
    setPhotoBusy(true)
    const { error } = await supabase.auth.updateUser({ data: { avatar_url: null } })
    setPhotoBusy(false)
    if (error) addToast(error.message, 'error')
    else addToast('Profile photo removed')
  }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    const initials = name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'U'
    const { error } = await supabase.auth.updateUser({ data: { name: name.trim(), org: org.trim() || 'My Company', role: role.trim() || 'Strategist', initials } })
    setSaving(false)
    if (error) addToast(error.message, 'error')
    else addToast('Profile updated')
  }

  const handleEmailChange = async () => {
    if (!newEmail.trim() || newEmail.trim() === email) return
    setEmailSaving(true)
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() })
    setEmailSaving(false)
    if (error) addToast(error.message, 'error')
    else { addToast('Check your new inbox to confirm the email change'); setNewEmail('') }
  }

  return (
    <>
      <SectionCard title="Your profile">
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Avatar
              user={user}
              style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--ink)', color: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontFamily: "'DM Mono',monospace" }}
            />
            {photoBusy && (
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(26,23,20,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="btn-loading"><span /></span>
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{user.name}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-l)', marginTop: 2 }}>{user.role} · {user.org}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn-sm btn-sm-ghost" onClick={() => photoInputRef.current?.click()} disabled={photoBusy}>
                {user.avatarUrl ? 'Change photo' : 'Upload photo'}
              </button>
              {user.avatarUrl && (
                <button className="btn-sm btn-sm-ghost" style={{ color: '#c0392b' }} onClick={handleRemovePhoto} disabled={photoBusy}>
                  Remove
                </button>
              )}
              <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />
            </div>
          </div>
        </div>

        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input type="text" className="form-input" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Role</label>
            <input type="text" className="form-input" value={role} onChange={e => setRole(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Organization</label>
          <input type="text" className="form-input" value={org} onChange={e => setOrg(e.target.value)} />
        </div>

        <button className="btn-sm btn-sm-primary" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? <span className="btn-loading"><span />Saving...</span> : 'Save Changes'}
        </button>
      </SectionCard>

      <SectionCard title="Email address" subtitle={memberSince ? `Member since ${memberSince}` : undefined}>
        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">Current Email</label>
            <input type="text" className="form-input" value={email ?? ''} disabled style={{ opacity: 0.65 }} />
          </div>
          <div className="form-group">
            <label className="form-label">New Email</label>
            <input type="email" className="form-input" placeholder="you@newdomain.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
          </div>
        </div>
        <button className="btn-sm btn-sm-ghost" onClick={handleEmailChange} disabled={!newEmail.trim() || emailSaving}>
          {emailSaving ? <span className="btn-loading"><span />Sending...</span> : 'Change Email'}
        </button>
        <div style={{ fontSize: 11, color: 'var(--ink-l)', marginTop: 10 }}>
          We'll send a confirmation link to the new address before the change takes effect.
        </div>
      </SectionCard>
    </>
  )
}

// ── Appearance ───────────────────────────────────────────────

const ACCENT_SWATCHES: { id: AccentColor; hex: string }[] = [
  { id: 'orange', hex: '#d4501a' },
  { id: 'teal',   hex: '#0ea5a0' },
  { id: 'violet', hex: '#7c3aed' },
  { id: 'blue',   hex: '#2563eb' },
  { id: 'rose',   hex: '#e11d48' },
]

const FONT_OPTIONS: { id: FontFamily; label: string; preview: string }[] = [
  { id: 'sans',   label: 'DM Sans (default)', preview: "'DM Sans', sans-serif" },
  { id: 'inter',  label: 'Inter',             preview: "'Inter', sans-serif" },
  { id: 'serif',  label: 'Serif',             preview: "'Lora', Georgia, serif" },
  { id: 'mono',   label: 'Monospace',         preview: "'DM Mono', monospace" },
  { id: 'system', label: 'System UI',         preview: '-apple-system, BlinkMacSystemFont, sans-serif' },
]

function AppearanceTab({ tweaks, setTweak }: { tweaks: Tweaks; setTweak: Props['setTweak'] }) {
  return (
    <>
      <SectionCard title="Theme" subtitle="Choose how Integro AI looks on this device.">
        <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          {(['light', 'dark', 'system'] as ThemeMode[]).map(t => (
            <SegButton key={t} active={tweaks.theme === t} onClick={() => setTweak('theme', t)}>
              {t === 'system' ? 'Match System' : t[0].toUpperCase() + t.slice(1)}
            </SegButton>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Accent color">
        <div style={{ display: 'flex', gap: 12 }}>
          {ACCENT_SWATCHES.map(s => (
            <div
              key={s.id}
              onClick={() => setTweak('accentColor', s.id)}
              title={s.id}
              style={{
                width: 32, height: 32, borderRadius: '50%', background: s.hex, cursor: 'pointer',
                border: `2.5px solid ${tweaks.accentColor === s.id ? 'var(--ink)' : 'transparent'}`,
                boxShadow: tweaks.accentColor === s.id ? '0 0 0 2px var(--cream)' : 'none',
                transition: 'all 0.15s',
              }}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Glass transparency" subtitle="Adjust how see-through the frosted-glass panels are.">
        <input
          type="range"
          min={10}
          max={95}
          step={1}
          value={tweaks.glassOpacity}
          onChange={e => setTweak('glassOpacity', Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--orange)' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: "'DM Mono',monospace", color: 'var(--ink-l)', marginTop: 4, marginBottom: 16 }}>
          <span>More transparent</span>
          <span>{tweaks.glassOpacity}%</span>
          <span>More opaque</span>
        </div>
        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 12, color: 'var(--ink-m)' }}>This card uses your current glass settings — the sidebar, header, and other panels update the same way.</div>
        </div>
      </SectionCard>

      <SectionCard title="Font">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {FONT_OPTIONS.map(f => (
            <div
              key={f.id}
              onClick={() => setTweak('fontFamily', f.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                border: `1px solid ${tweaks.fontFamily === f.id ? 'var(--orange)' : 'var(--rule)'}`,
                background: tweaks.fontFamily === f.id ? 'rgba(212,80,26,0.06)' : 'transparent',
              }}
            >
              <span style={{ fontFamily: f.preview, fontSize: 14 }}>{f.label} — The quick brown fox</span>
              {tweaks.fontFamily === f.id && <Icon name="check" size={13} style={{ color: 'var(--orange)' }} />}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Layout density">
        <div style={{ display: 'flex', gap: 8 }}>
          {(['compact', 'default', 'comfortable'] as DensityMode[]).map(d => (
            <SegButton key={d} active={tweaks.density === d} onClick={() => setTweak('density', d)}>
              {d[0].toUpperCase() + d.slice(1)}
            </SegButton>
          ))}
        </div>
      </SectionCard>
    </>
  )
}

// ── White Label ──────────────────────────────────────────────
// Workspace-level branding — not a per-user preference like Appearance, so
// it isn't wired into `tweaks`/Supabase yet. State here is local to the
// tab; domain verification is simulated so the page stays demoable without
// a DNS backend, matching how the rest of the app degrades gracefully.

function LogoUploadRow({ label, hint, dark, onUpload }: { label: string; hint: string; dark?: boolean; onUpload: () => void }) {
  return (
    <Row label={label} hint={hint}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 96, height: 36, borderRadius: 'var(--radius-sm)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Bebas Neue',sans-serif", fontSize: 13, letterSpacing: '0.03em',
          background: dark ? '#211c17' : 'rgba(255,255,255,0.55)',
          color: dark ? '#f0ece4' : 'var(--ink-m)',
          border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px dashed rgba(26,23,20,0.18)',
        }}>
          {dark ? 'LOGO' : 'LOGO'}
        </div>
        <button className="btn-sm btn-sm-ghost" onClick={onUpload}>Upload</button>
      </div>
    </Row>
  )
}

function WhiteLabelTab({ user, addToast }: { user: User; addToast: Props['addToast'] }) {
  const [primaryColor, setPrimaryColor] = useState('#0EA5A0')
  const [inkColor, setInkColor] = useState('#1A1714')
  const [fontChoice, setFontChoice] = useState<'sans' | 'inter' | 'custom'>('sans')
  const [customFont, setCustomFont] = useState('Sora')
  const [domain, setDomain] = useState('')
  const [domainStatus, setDomainStatus] = useState<'unset' | 'pending' | 'verified'>('unset')
  const [poweredBy, setPoweredBy] = useState(true)
  const [saving, setSaving] = useState(false)

  const handleUpload = (label: string) => addToast(`${label} upload — coming soon`)

  const handleVerify = () => {
    if (!domain.trim()) return
    setDomainStatus('pending')
    setTimeout(() => { setDomainStatus('verified'); addToast('Domain verified (simulated for this preview)') }, 1400)
  }

  const handleSave = () => {
    setSaving(true)
    setTimeout(() => { setSaving(false); addToast('Branding saved — this preview isn’t persisted to your workspace yet') }, 400)
  }

  const previewFont = fontChoice === 'sans' ? "'DM Sans', sans-serif" : fontChoice === 'inter' ? "'Inter', sans-serif" : `'${customFont || 'Sora'}', sans-serif`

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
      <div>
        <SectionCard title="Brand identity" subtitle="Replace the Integro AI mark with your own across the sidebar, sign-in screen, and browser tab.">
          <LogoUploadRow label="Logo — light backgrounds" hint="SVG or PNG, transparent background. 240×60px recommended." onUpload={() => handleUpload('Light logo')} />
          <LogoUploadRow label="Logo — dark backgrounds" hint="Used when your workspace is set to dark mode." dark onUpload={() => handleUpload('Dark logo')} />
          <Row label="Favicon" hint="32×32px. Shown in the browser tab and bookmarks.">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: primaryColor, flexShrink: 0 }} />
              <button className="btn-sm btn-sm-ghost" onClick={() => handleUpload('Favicon')}>Upload</button>
            </div>
          </Row>
        </SectionCard>

        <SectionCard title="Brand colors" subtitle="Sets the accent used for buttons, links, active nav states, and status highlights.">
          <Row label="Primary accent" hint="Falls back to Integro's default orange (#D4501A) until set.">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: primaryColor, boxShadow: 'inset 0 0 0 1px rgba(26,23,20,0.12)', flexShrink: 0 }} />
              <input className="form-input" style={{ width: 110, padding: '8px 10px', fontFamily: "'DM Mono',monospace", fontSize: 12 }} value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} />
            </div>
          </Row>
          <Row label="Ink / text tone" hint="Base text and dark-surface color across the workspace.">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: inkColor, boxShadow: 'inset 0 0 0 1px rgba(26,23,20,0.12)', flexShrink: 0 }} />
              <input className="form-input" style={{ width: 110, padding: '8px 10px', fontFamily: "'DM Mono',monospace", fontSize: 12 }} value={inkColor} onChange={e => setInkColor(e.target.value)} />
            </div>
          </Row>
        </SectionCard>

        <SectionCard title="Typography" subtitle="Choose a built-in face, or load any Google Font by name.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { id: 'sans' as const,  label: 'DM Sans — default', preview: "'DM Sans', sans-serif" },
              { id: 'inter' as const, label: 'Inter',             preview: "'Inter', sans-serif" },
            ].map(f => (
              <div
                key={f.id}
                onClick={() => setFontChoice(f.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                  padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${fontChoice === f.id ? 'var(--orange)' : 'var(--rule)'}`,
                  background: fontChoice === f.id ? 'rgba(212,80,26,0.06)' : 'transparent',
                }}
              >
                <span style={{ fontFamily: f.preview, fontSize: 14 }}>{f.label} — The quick brown fox</span>
                {fontChoice === f.id && <Icon name="check" size={13} style={{ color: 'var(--orange)' }} />}
              </div>
            ))}
            <div
              onClick={() => setFontChoice('custom')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer',
                padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                border: `1px solid ${fontChoice === 'custom' ? 'var(--orange)' : 'var(--rule)'}`,
                background: fontChoice === 'custom' ? 'rgba(212,80,26,0.06)' : 'transparent',
              }}
            >
              <span style={{ fontFamily: previewFont, fontSize: 14, flex: 1 }}>{customFont || 'Custom'} — custom Google Font</span>
              <input
                className="form-input"
                style={{ width: 130, padding: '6px 10px', fontSize: 12 }}
                value={customFont}
                onClick={e => e.stopPropagation()}
                onChange={e => setCustomFont(e.target.value)}
              />
              {fontChoice === 'custom' && <Icon name="check" size={13} style={{ color: 'var(--orange)' }} />}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Custom domain" subtitle="Serve the workspace from your own domain instead of app.integroai.com.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: domainStatus !== 'unset' ? 12 : 0 }}>
            <input className="form-input" style={{ flex: 1 }} placeholder="app.yourcompany.com" value={domain} onChange={e => setDomain(e.target.value)} />
            <button className="btn-sm btn-sm-ghost" onClick={handleVerify} disabled={!domain.trim() || domainStatus === 'pending'}>
              {domainStatus === 'pending' ? 'Verifying…' : 'Verify'}
            </button>
            {domainStatus === 'pending' && (
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 'var(--radius-pill)', background: 'rgba(245,166,35,0.15)', color: '#c47d00', border: '1px solid rgba(245,166,35,0.25)', whiteSpace: 'nowrap' }}>Pending DNS</span>
            )}
            {domainStatus === 'verified' && (
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 'var(--radius-pill)', background: 'rgba(16,185,129,0.16)', color: '#059669', border: '1px solid rgba(16,185,129,0.3)', whiteSpace: 'nowrap' }}>Verified</span>
            )}
          </div>
          {domainStatus !== 'unset' && domain && (
            <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(26,23,20,0.04)', border: '1px solid var(--rule)', fontFamily: "'DM Mono',monospace", fontSize: 11, color: 'var(--ink-m)', lineHeight: 1.7 }}>
              Add a <strong style={{ color: 'var(--ink)' }}>CNAME</strong> record: <strong style={{ color: 'var(--ink)' }}>{domain}</strong> → <strong style={{ color: 'var(--ink)' }}>clients.integroai.com</strong><br />
              Verification above is simulated for this preview — DNS changes normally take up to 24 hours to propagate.
            </div>
          )}
        </SectionCard>

        <SectionCard title="Plan">
          <Row label={'"Powered by Integro AI" badge'} hint="Shown in the footer on the free plan. Included in Agency and Enterprise white-label plans.">
            <Toggle enabled={poweredBy} onChange={() => setPoweredBy(p => !p)} />
          </Row>
        </SectionCard>

        <button className="btn-sm btn-sm-primary" onClick={handleSave} disabled={saving}>
          {saving ? <span className="btn-loading"><span />Saving...</span> : 'Save Changes'}
        </button>
      </div>

      <div style={{ position: 'sticky', top: 0 }}>
        <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: primaryColor, boxShadow: `0 0 5px ${primaryColor}99` }} />
          Live Preview
        </div>
        <div style={{ borderRadius: 'var(--radius)', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)', overflow: 'hidden', background: '#fdfaf4' }}>
          <div style={{ height: 38, background: 'rgba(245,240,232,0.9)', borderBottom: '1px solid rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', padding: '0 14px' }}>
            <span style={{ fontFamily: previewFont, fontWeight: 600, fontSize: 13, color: inkColor }}>{user.org || 'Your Workspace'}</span>
          </div>
          <div style={{ display: 'flex', height: 260 }}>
            <div style={{ width: 96, background: 'rgba(245,240,232,0.6)', borderRight: '1px solid rgba(255,255,255,0.5)', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
              {['Outbound', 'Demand Gen', 'Success', 'Playbooks'].map((n, i) => (
                <div key={n} style={{
                  fontSize: 9.5, padding: '6px 8px', borderRadius: 6,
                  background: i === 0 ? primaryColor : 'transparent',
                  color: i === 0 ? '#fff' : 'var(--ink-m)', fontWeight: i === 0 ? 500 : 400,
                }}>{n}</div>
              ))}
            </div>
            <div style={{ flex: 1, padding: 14 }}>
              {[{ l: 'In Sequence', v: '428' }, { l: 'Reply Rate', v: '18%' }].map(s => (
                <div key={s.l} style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.7)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 7.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 5 }}>{s.l}</div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: inkColor }}>{s.v}</div>
                </div>
              ))}
              <span style={{ display: 'inline-block', marginTop: 4, padding: '6px 14px', borderRadius: 100, background: primaryColor, color: '#fff', fontSize: 10, fontWeight: 500 }}>+ New Sequence</span>
            </div>
          </div>
          {poweredBy && (
            <div style={{ height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(245,240,232,0.5)', borderTop: '1px solid rgba(255,255,255,0.5)', fontFamily: "'DM Mono',monospace", fontSize: 8.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink-l)', opacity: 0.55 }}>
              Powered by Integro AI
            </div>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-l)', marginTop: 10, padding: '0 2px', lineHeight: 1.5 }}>
          Updates as you edit the settings on the left — this is what {domain || 'your custom domain'} will look like for your team.
        </div>
      </div>
    </div>
  )
}

// ── Notifications ────────────────────────────────────────────

function NotificationsTab({ tweaks, setTweak, addToast }: { tweaks: Tweaks; setTweak: Props['setTweak']; addToast: Props['addToast'] }) {
  const handleDesktopToggle = async () => {
    const turningOn = !tweaks.notifications.desktop
    if (turningOn && typeof Notification !== 'undefined') {
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission()
      if (permission !== 'granted') {
        addToast('Desktop notifications were blocked by your browser', 'error')
        return
      }
    }
    setTweak('notifications', { ...tweaks.notifications, desktop: turningOn })
  }

  return (
    <SectionCard title="Notification preferences" subtitle="Choose what Integro AI can notify you about.">
      <Row label="Email notifications" hint="Deal alerts, weekly digests, and agent approval requests.">
        <Toggle enabled={tweaks.notifications.email} onChange={() => setTweak('notifications', { ...tweaks.notifications, email: !tweaks.notifications.email })} />
      </Row>
      <Row label="Sound" hint="Play a sound when a new in-app notification arrives.">
        <Toggle enabled={tweaks.notifications.sound} onChange={() => setTweak('notifications', { ...tweaks.notifications, sound: !tweaks.notifications.sound })} />
      </Row>
      <Row label="Desktop notifications" hint="Requires browser permission.">
        <Toggle enabled={tweaks.notifications.desktop} onChange={handleDesktopToggle} />
      </Row>
    </SectionCard>
  )
}

// ── Security ─────────────────────────────────────────────────

function SecurityTab({ addToast, onLogout }: { addToast: Props['addToast']; onLogout: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const canSave = password.length >= 8 && password === confirm

  const handlePasswordChange = async () => {
    if (!canSave) return
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) addToast(error.message, 'error')
    else { addToast('Password updated'); setPassword(''); setConfirm('') }
  }

  return (
    <>
      <SectionCard title="Change password">
        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input type="password" className="form-input" placeholder="At least 8 characters" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input type="password" className="form-input" placeholder="Repeat password" value={confirm} onChange={e => setConfirm(e.target.value)} />
          </div>
        </div>
        {password && confirm && password !== confirm && (
          <div style={{ fontSize: 11, color: '#c0392b', marginBottom: 10 }}>Passwords don't match</div>
        )}
        <button className="btn-sm btn-sm-primary" onClick={handlePasswordChange} disabled={!canSave || saving}>
          {saving ? <span className="btn-loading"><span />Updating...</span> : 'Update Password'}
        </button>
      </SectionCard>

      <SectionCard title="Session">
        <Row label="Signed in on this device" hint="Sign out if you're on a shared or public computer.">
          <button className="btn-sm btn-sm-ghost" onClick={onLogout}>Sign Out</button>
        </Row>
      </SectionCard>

      <SectionCard title="Danger zone">
        <Row label="Delete account" hint="Permanently removes your account and all associated data.">
          {!confirmDelete ? (
            <button className="btn-sm btn-sm-ghost" style={{ color: '#c0392b' }} onClick={() => setConfirmDelete(true)}>Delete Account</button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-sm btn-sm-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button
                className="btn-sm btn-sm-ghost"
                style={{ color: '#c0392b', borderColor: 'rgba(192,57,43,0.4)' }}
                onClick={() => { setConfirmDelete(false); addToast('Account deletion requests are handled by your workspace admin — reach out to have this account removed.', 'error') }}
              >
                Confirm Delete
              </button>
            </div>
          )}
        </Row>
      </SectionCard>
    </>
  )
}

// ── Main view ────────────────────────────────────────────────

export default function SettingsView({ active, user, tweaks, setTweak, addToast, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>('profile')

  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="view-header">
        <div>
          <div className="view-subtitle">Preferences</div>
          <h1 className="display view-title">Settings</h1>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--rule)', marginBottom: 20 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontFamily: "'DM Mono',monospace", fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: tab === t.id ? 'var(--ink)' : 'var(--ink-l)',
              borderBottom: tab === t.id ? '2px solid var(--orange)' : '2px solid transparent',
              marginBottom: -1, transition: 'color 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: tab === 'white-label' ? 1040 : 620 }}>
        {tab === 'profile' && <ProfileTab user={user} addToast={addToast} />}
        {tab === 'appearance' && <AppearanceTab tweaks={tweaks} setTweak={setTweak} />}
        {tab === 'white-label' && <WhiteLabelTab user={user} addToast={addToast} />}
        {tab === 'notifications' && <NotificationsTab tweaks={tweaks} setTweak={setTweak} addToast={addToast} />}
        {tab === 'security' && <SecurityTab addToast={addToast} onLogout={onLogout} />}
      </div>
    </div>
  )
}
