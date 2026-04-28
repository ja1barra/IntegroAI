import { useState } from 'react'
import SignIn from './views/SignIn'
import AppShell from './AppShell'
import type { User } from './types'

export default function App() {
  const [user, setUser] = useState<User | null>(null)

  if (!user) return <SignIn onLogin={setUser} />
  return <AppShell user={user} onLogout={() => setUser(null)} />
}
