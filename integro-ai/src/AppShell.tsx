import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './lib/supabase'
import AppHeader from './components/layout/AppHeader'
import Sidebar from './components/layout/Sidebar'
import NotificationPanel from './components/layout/NotificationPanel'
import TweaksPanel from './components/layout/TweaksPanel'
import ToastContainer from './components/ui/Toast'
import Dashboard from './views/Dashboard'
import OutboundView from './views/OutboundView'
import DemandView from './views/DemandView'
import SuccessView from './views/SuccessView'
import PlaybookAgentView from './views/PlaybookAgentView'
import PlaybooksView from './views/PlaybooksView'
import ReportsView from './views/ReportsView'
import IntegrationsView from './views/IntegrationsView'
import TeamView from './views/TeamView'
import type { User, AgentStates, AgentId, Toast, Tweaks } from './types'

const DEFAULT_AGENT_STATES: AgentStates = { outbound: 'running', demand: 'running', success: 'running', 'playbook-agent': 'running' }
const DEFAULT_TWEAKS: Tweaks = { darkMode: false, accentColor: 'orange', density: 'default' }

// Debounce helper — persist settings at most once per second
function useDebouncedPersist(userId: string, agentStates: AgentStates, tweaks: Tweaks, ready: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!ready) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supabase.from('user_settings').upsert({
        user_id: userId,
        agent_states: agentStates as any,
        tweaks: tweaks as any,
        updated_at: new Date().toISOString(),
      })
    }, 1000)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [userId, agentStates, tweaks, ready])
}

export default function AppShell({ user, userId, onLogout }: { user: User; userId: string; onLogout: () => void }) {
  const [view, setView] = useState('dashboard')
  const [agentStates, setAgentStates] = useState<AgentStates>(DEFAULT_AGENT_STATES)
  const [notifOpen, setNotifOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [tweaks, setTweaksState] = useState<Tweaks>(DEFAULT_TWEAKS)
  const [tweaksOpen, setTweaksOpen] = useState(false)
  const [settingsReady, setSettingsReady] = useState(false)

  // Load persisted settings on mount
  useEffect(() => {
    supabase
      .from('user_settings')
      .select('agent_states, tweaks')
      .eq('user_id', userId)
      .single()
      .then(({ data }) => {
        if (data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (data.agent_states) setAgentStates(data.agent_states as any as AgentStates)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (data.tweaks) setTweaksState(data.tweaks as any as Tweaks)
        }
        setSettingsReady(true)
      })
  }, [userId])

  useDebouncedPersist(userId, agentStates, tweaks, settingsReady)

  const addToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3200)
  }, [])

  const toggleAgent = (id: AgentId) =>
    setAgentStates(p => ({ ...p, [id]: p[id] === 'running' ? 'paused' : 'running' }))

  const setTweak = (key: keyof Tweaks, value: Tweaks[keyof Tweaks]) =>
    setTweaksState(prev => ({ ...prev, [key]: value }))

  // Apply tweaks to DOM
  useEffect(() => {
    document.body.classList.toggle('dark', tweaks.darkMode)
    const accents: Record<string, [string, string]> = {
      orange: ['#d4501a', '#b84215'],
      teal:   ['#0ea5a0', '#0c8a86'],
      violet: ['#7c3aed', '#6d28d9'],
    }
    const [a, ah] = accents[tweaks.accentColor] ?? accents.orange
    document.documentElement.style.setProperty('--orange', a)
    document.documentElement.style.setProperty('--orange-h', ah)
    document.documentElement.style.setProperty('--header-h', tweaks.density === 'compact' ? '44px' : '56px')
    document.documentElement.style.setProperty('--sidebar-w', tweaks.density === 'compact' ? '196px' : '220px')
  }, [tweaks])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setNotifOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const sharedProps = { agentStates, toggleAgent, addToast }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppHeader user={user} onLogout={onLogout} onToggleNotif={() => setNotifOpen(p => !p)} notifOpen={notifOpen}>
        <NotificationPanel />
      </AppHeader>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar view={view} setView={(v) => { setView(v); setNotifOpen(false) }} agentStates={agentStates} user={user} onLogout={onLogout} />

        <main className="main" onClick={() => setNotifOpen(false)}>
          <Dashboard         active={view === 'dashboard'}       onNavigate={setView} {...sharedProps} />
          <OutboundView      active={view === 'outbound'}         {...sharedProps} />
          <DemandView        active={view === 'demand'}           {...sharedProps} />
          <SuccessView       active={view === 'success'}          {...sharedProps} />
          <PlaybookAgentView active={view === 'playbook-agent'}   {...sharedProps} />
          <PlaybooksView     active={view === 'playbooks'}        addToast={addToast} />
          <ReportsView       active={view === 'reports'}          addToast={addToast} />
          <IntegrationsView  active={view === 'integrations'}     addToast={addToast} />
          <TeamView          active={view === 'team'}             addToast={addToast} />
        </main>
      </div>

      <ToastContainer toasts={toasts} />
      {tweaksOpen && (
        <TweaksPanel tweaks={tweaks} setTweak={setTweak} onClose={() => setTweaksOpen(false)} />
      )}
    </div>
  )
}
