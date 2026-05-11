import { useState, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import SignIn from './views/SignIn'
import AppShell from './AppShell'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    // Parse any error/token in the URL hash (Supabase email confirmation redirect)
    const hash = window.location.hash
    if (hash) {
      const params = new URLSearchParams(hash.slice(1))
      const errorDesc = params.get('error_description')
      if (errorDesc) {
        setAuthError(decodeURIComponent(errorDesc.replace(/\+/g, ' ')))
        // Clean the URL so the error doesn't persist on reload
        window.history.replaceState(null, '', window.location.pathname)
        setSession(null)
        return
      }
    }

    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      // Clear any previous auth error once signed in
      if (s) setAuthError(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: 'var(--orange)', letterSpacing: '0.06em' }}>
          INTEGRO AI
        </div>
      </div>
    )
  }

  if (!session) return <SignIn initialError={authError} />

  const user = {
    name: session.user.user_metadata?.name ?? session.user.email?.split('@')[0] ?? 'User',
    initials: session.user.user_metadata?.initials ?? 'U',
    role: session.user.user_metadata?.role ?? 'Strategist',
    org: session.user.user_metadata?.org ?? 'My Company',
  }

  return (
    <AppShell
      user={user}
      userId={session.user.id}
      onLogout={() => supabase.auth.signOut()}
    />
  )
}
