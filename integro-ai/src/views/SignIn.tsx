import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function SignIn({ initialError }: { initialError?: string | null }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [name, setName] = useState('')
  const [org, setOrg] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(initialError ?? '')
  const [success, setSuccess] = useState('')
  const [shake, setShake] = useState(false)

  const triggerShake = () => { setShake(true); setTimeout(() => setShake(false), 600) }

  const doSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.includes('@')) { setError('Please enter a valid email.'); triggerShake(); return }
    if (pw.length < 6) { setError('Password must be at least 6 characters.'); triggerShake(); return }
    setLoading(true); setError('')
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password: pw })
    if (authError) { setError(authError.message); triggerShake() }
    setLoading(false)
  }

  const doSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Please enter your name.'); triggerShake(); return }
    if (!email.includes('@')) { setError('Please enter a valid email.'); triggerShake(); return }
    if (pw.length < 6) { setError('Password must be at least 6 characters.'); triggerShake(); return }
    setLoading(true); setError(''); setSuccess('')

    const initials = name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password: pw,
      options: { data: { name: name.trim(), initials, role: 'Strategist', org: org.trim() || 'My Company' } }
    })

    if (authError) {
      setError(authError.message); triggerShake()
    } else if (data.user && !data.session) {
      setSuccess('Check your email to confirm your account, then sign in.')
    }
    setLoading(false)
  }

  const doDemo = async () => {
    const demoEmail = import.meta.env.VITE_DEMO_EMAIL as string | undefined
    const demoPw    = import.meta.env.VITE_DEMO_PASSWORD as string | undefined
    if (!demoEmail || !demoPw) {
      setError('Demo account is not configured.')
      triggerShake()
      return
    }
    setLoading(true); setError('')
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: demoEmail,
      password: demoPw,
    })
    if (authError) {
      setError('Demo account unavailable — please sign up for free.')
      triggerShake()
    }
    setLoading(false)
  }

  return (
    <div id="page-signin">
      <div className="signin-left">
        <div className="signin-brand">
          <span className="signin-brand-name">INTEGRO AI</span>
          <span className="brand-tag">Beta</span>
        </div>
        <div>
          <div className="display signin-headline">Your Revenue<br />OS is <span className="accent">Live.</span></div>
        </div>
        <div className="signin-agents">
          {[['green','Outbound Sales Machine'],['amber','Demand Generation'],['blue','Customer Success Engine'],['purple','SaaS Growth Playbooks']].map(([color, agentName], i) => (
            <div key={agentName} className="signin-agent-row" style={{ animationDelay: `${0.3 + i * 0.15}s` }}>
              <div className={`agent-dot ${color}`} />
              <span className="signin-agent-name">{agentName}</span>
              <span className="signin-agent-status">Running</span>
            </div>
          ))}
        </div>
      </div>

      <div className="signin-right">
        <div className={`signin-form-wrap ${shake ? 'form-shake' : ''}`} style={{ animation: 'fadeUp 0.5s ease forwards', animationDelay: '0.15s', opacity: 0 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            {(['signin', 'signup'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); setSuccess('') }}
                style={{
                  flex: 1, padding: '9px 0', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  background: mode === m ? 'var(--orange)' : 'var(--surface-2)',
                  color: mode === m ? '#fff' : 'var(--ink-l)',
                  transition: 'all 0.18s',
                }}
              >
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {mode === 'signin' ? (
            <>
              <div className="signin-form-title">Welcome back</div>
              <div className="signin-form-sub">Access your Integro AI dashboard</div>
              <form onSubmit={doSignIn}>
                <div className="form-group">
                  <label className="form-label">Work Email</label>
                  <input type="email" className="form-input" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} disabled={loading} />
                </div>
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input type="password" className="form-input" placeholder="••••••••" value={pw} onChange={e => setPw(e.target.value)} disabled={loading} />
                </div>
                {error && <div style={{ color: '#e74c3c', fontSize: 12, marginBottom: 12, fontFamily: "'DM Mono',monospace" }}>{error}</div>}
                <button type="submit" className="signin-btn" disabled={loading}>
                  {loading ? <span className="btn-loading"><span />Signing in…</span> : 'Sign In →'}
                </button>
              </form>
              <div className="signin-divider">or</div>
              <button className="demo-btn" onClick={doDemo} disabled={loading}>Continue with Demo Account</button>
            </>
          ) : (
            <>
              <div className="signin-form-title">Get started free</div>
              <div className="signin-form-sub">Create your Integro AI account</div>
              {success ? (
                <div style={{ background: 'rgba(62,207,142,0.12)', border: '1px solid #3ecf8e', borderRadius: 8, padding: '14px 16px', color: '#3ecf8e', fontSize: 13, lineHeight: 1.5 }}>
                  {success}
                </div>
              ) : (
                <form onSubmit={doSignUp}>
                  <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input type="text" className="form-input" placeholder="Jane Smith" value={name} onChange={e => setName(e.target.value)} disabled={loading} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Work Email</label>
                    <input type="email" className="form-input" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} disabled={loading} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Company <span style={{ color: 'var(--ink-l)', fontWeight: 400 }}>(optional)</span></label>
                    <input type="text" className="form-input" placeholder="Acme SaaS Co." value={org} onChange={e => setOrg(e.target.value)} disabled={loading} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Password</label>
                    <input type="password" className="form-input" placeholder="Min. 6 characters" value={pw} onChange={e => setPw(e.target.value)} disabled={loading} />
                  </div>
                  {error && <div style={{ color: '#e74c3c', fontSize: 12, marginBottom: 12, fontFamily: "'DM Mono',monospace" }}>{error}</div>}
                  <button type="submit" className="signin-btn" disabled={loading}>
                    {loading ? <span className="btn-loading"><span />Creating account…</span> : 'Create Account →'}
                  </button>
                </form>
              )}
            </>
          )}

          <div className="signin-footer-note">Questions? Contact <span style={{ color: 'var(--orange)' }}>jay@integrostrategies.com</span></div>
        </div>
      </div>
    </div>
  )
}
