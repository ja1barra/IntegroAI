import { useState } from 'react'
import type { User } from '../types'

export default function SignIn({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)

  const triggerShake = () => { setShake(true); setTimeout(() => setShake(false), 600) }

  const doSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.includes('@')) { setError('Please enter a valid email.'); triggerShake(); return }
    if (pw.length < 3) { setError('Password is required.'); triggerShake(); return }
    setLoading(true); setError('')
    await new Promise(r => setTimeout(r, 1100))
    onLogin({ name: 'Jay Rodriguez', initials: 'JR', role: 'Strategist', org: 'Acme SaaS Co.' })
  }

  const doDemo = async () => {
    setLoading(true)
    await new Promise(r => setTimeout(r, 750))
    onLogin({ name: 'Jay Rodriguez', initials: 'JR', role: 'Strategist', org: 'Acme SaaS Co.' })
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
          {[['green','Outbound Sales Machine'],['amber','Demand Generation'],['blue','Customer Success Engine'],['purple','SaaS Growth Playbooks']].map(([color, name], i) => (
            <div key={name} className="signin-agent-row" style={{ animationDelay: `${0.3 + i * 0.15}s` }}>
              <div className={`agent-dot ${color}`} />
              <span className="signin-agent-name">{name}</span>
              <span className="signin-agent-status">Running</span>
            </div>
          ))}
        </div>
      </div>
      <div className="signin-right">
        <div className={`signin-form-wrap ${shake ? 'form-shake' : ''}`} style={{ animation: 'fadeUp 0.5s ease forwards', animationDelay: '0.15s', opacity: 0 }}>
          <div className="signin-form-title">Sign in</div>
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
              {loading ? <span className="btn-loading"><span />Signing in</span> : 'Sign In →'}
            </button>
          </form>
          <div className="signin-divider">or</div>
          <button className="demo-btn" onClick={doDemo} disabled={loading}>Continue with Demo Account</button>
          <div className="signin-footer-note">Need access? Contact <span style={{ color: 'var(--orange)' }}>jay@integrostrategies.com</span></div>
        </div>
      </div>
    </div>
  )
}
