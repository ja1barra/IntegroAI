import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './lib/supabase'
import AppHeader from './components/layout/AppHeader'
import Sidebar from './components/layout/Sidebar'
import NotificationPanel from './components/layout/NotificationPanel'
import TweaksPanel from './components/layout/TweaksPanel'
import ToastContainer from './components/ui/Toast'
import TaskCreatorModal from './components/ui/TaskCreatorModal'
import Dashboard from './views/Dashboard'
import TasksView from './views/TasksView'
import OutboundView from './views/OutboundView'
import DemandView from './views/DemandView'
import SuccessView from './views/SuccessView'
import PlaybookAgentView from './views/PlaybookAgentView'
import PlaybooksView from './views/PlaybooksView'
import ReportsView from './views/ReportsView'
import IntegrationsView from './views/IntegrationsView'
import TeamView from './views/TeamView'
import ProfileView from './views/ProfileView'
import AcademyView from './views/AcademyView'
import { useTasks } from './hooks/useTasks'
import type { User, AgentStates, AgentId, Toast, Tweaks, Task } from './types'

const DEFAULT_AGENT_STATES: AgentStates = { outbound: 'running', demand: 'running', success: 'running', 'playbook-agent': 'running' }
const DEFAULT_TWEAKS: Tweaks = { darkMode: false, accentColor: 'orange', density: 'default' }

async function persistSettings(userId: string, agentStates: AgentStates, tweaks: Tweaks) {
  const { error } = await supabase.from('user_settings').upsert({
    user_id: userId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agent_states: agentStates as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tweaks: tweaks as any,
    updated_at: new Date().toISOString(),
  })
  return error
}

export default function AppShell({ user, userId, onLogout }: { user: User; userId: string; onLogout: () => void }) {
  const [view, setView] = useState('dashboard')
  const [agentStates, setAgentStates] = useState<AgentStates>(DEFAULT_AGENT_STATES)
  const [notifOpen, setNotifOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [tweaks, setTweaksState] = useState<Tweaks>(DEFAULT_TWEAKS)
  const [tweaksOpen, setTweaksOpen] = useState(false)
  const [settingsReady, setSettingsReady] = useState(false)

  const { tasks, addTask, updateTask, deleteTask } = useTasks()
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  const openTaskModal = useCallback((task?: Task) => {
    setEditingTask(task ?? null)
    setTaskModalOpen(true)
  }, [])

  const agentStatesRef = useRef(agentStates)
  const tweaksRef = useRef(tweaks)
  agentStatesRef.current = agentStates
  tweaksRef.current = tweaks

  const addToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3200)
  }, [])

  // Load persisted settings on mount
  useEffect(() => {
    supabase
      .from('user_settings')
      .select('agent_states, tweaks')
      .eq('user_id', userId)
      .maybeSingle()                          // won't crash if no row yet
      .then(({ data, error }) => {
        if (error) {
          addToast('Could not load your settings', 'error')
        } else if (data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (data.agent_states) setAgentStates(data.agent_states as any as AgentStates)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (data.tweaks) setTweaksState(data.tweaks as any as Tweaks)
        }
        setSettingsReady(true)
      })
  }, [userId, addToast])

  // Debounced persist — 1 second after last change
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!settingsReady) return
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(async () => {
      const error = await persistSettings(userId, agentStates, tweaks)
      if (error) addToast('Settings failed to save', 'error')
    }, 1000)
    return () => { if (persistTimer.current) clearTimeout(persistTimer.current) }
  }, [userId, agentStates, tweaks, settingsReady, addToast])

  // Flush pending save on page close so no changes are lost
  useEffect(() => {
    const flush = () => {
      if (!settingsReady) return
      persistSettings(userId, agentStatesRef.current, tweaksRef.current)
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [userId, settingsReady])

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
      <AppHeader user={user} onLogout={onLogout} onNavigate={setView} onToggleNotif={() => setNotifOpen(p => !p)} notifOpen={notifOpen}>
        <NotificationPanel />
      </AppHeader>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar view={view} setView={(v) => { setView(v); setNotifOpen(false) }} agentStates={agentStates} user={user} onLogout={onLogout} />

        <main className="main" onClick={() => setNotifOpen(false)}>
          <Dashboard         active={view === 'dashboard'}       onNavigate={setView} onNewTask={() => openTaskModal()} {...sharedProps} />
          <TasksView         active={view === 'tasks'}           tasks={tasks} onUpdateTask={updateTask} onDeleteTask={deleteTask} onOpenModal={openTaskModal} />
          <OutboundView      active={view === 'outbound'}         {...sharedProps} />
          <DemandView        active={view === 'demand'}           {...sharedProps} />
          <SuccessView       active={view === 'success'}          {...sharedProps} />
          <PlaybookAgentView active={view === 'playbook-agent'}   {...sharedProps} />
          <PlaybooksView     active={view === 'playbooks'}        addToast={addToast} />
          <ReportsView       active={view === 'reports'}          addToast={addToast} />
          <IntegrationsView  active={view === 'integrations'}     addToast={addToast} />
          <TeamView          active={view === 'team'}             addToast={addToast} user={user} />
          <ProfileView       active={view === 'profile'}          user={user} />
          <AcademyView       active={view === 'academy'} />
        </main>
      </div>

      <ToastContainer toasts={toasts} />

      <TaskCreatorModal
        isOpen={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        initial={editingTask}
        onSubmit={(data) => {
          if (editingTask) {
            updateTask(editingTask.id, data)
            addToast('Task updated')
          } else {
            addTask(data)
            addToast('Task created')
          }
        }}
      />
      {tweaksOpen && (
        <TweaksPanel tweaks={tweaks} setTweak={setTweak} onClose={() => setTweaksOpen(false)} />
      )}
    </div>
  )
}
