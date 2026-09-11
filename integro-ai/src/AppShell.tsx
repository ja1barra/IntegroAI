import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from './lib/supabase'
import AppHeader from './components/layout/AppHeader'
import Sidebar from './components/layout/Sidebar'
import NotificationPanel from './components/layout/NotificationPanel'
import ToastContainer from './components/ui/Toast'
import TaskCreatorModal from './components/ui/TaskCreatorModal'
import PlaybookModal from './components/ui/PlaybookModal'
import PlaybookGeneratorModal from './components/ui/PlaybookGeneratorModal'
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
import SettingsView from './views/SettingsView'
import AcademyView from './views/AcademyView'
import { useTasks } from './hooks/useTasks'
import { usePlaybooks } from './hooks/usePlaybooks'
import type { User, AgentStates, AgentId, Toast, Tweaks, Task, WhiteLabel } from './types'
import type { Playbook } from './lib/playbooks/types'

const DEFAULT_AGENT_STATES: AgentStates = { outbound: 'running', demand: 'running', success: 'running', 'playbook-agent': 'running' }
const DEFAULT_TWEAKS: Tweaks = {
  theme: 'light',
  accentColor: 'orange',
  density: 'default',
  glassOpacity: 60,
  fontFamily: 'sans',
  notifications: { email: true, sound: true, desktop: false },
}

const ACCENTS: Record<Tweaks['accentColor'], [string, string]> = {
  orange: ['#d4501a', '#b84215'],
  teal:   ['#0ea5a0', '#0c8a86'],
  violet: ['#7c3aed', '#6d28d9'],
  blue:   ['#2563eb', '#1d4ed8'],
  rose:   ['#e11d48', '#be123c'],
}

const DENSITIES: Record<Tweaks['density'], [string, string]> = {
  compact:     ['44px', '196px'],
  default:     ['56px', '220px'],
  comfortable: ['64px', '244px'],
}

const FONT_STACKS: Record<Tweaks['fontFamily'], string> = {
  sans:   "'DM Sans', sans-serif",
  inter:  "'Inter', sans-serif",
  serif:  "'Lora', Georgia, 'Times New Roman', serif",
  mono:   "'DM Mono', monospace",
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
}

// Darkens a #rrggbb hex color by `amount` (0-1) for a hover shade — used for
// a white-labeled workspace's custom accent, mirroring the hand-picked
// hover shades in ACCENTS above.
function darkenHex(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const clamp = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amount))))
  const r = clamp((n >> 16) & 255), g = clamp((n >> 8) & 255), b = clamp(n & 255)
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

// Older saved settings only ever had a `darkMode` boolean and no
// `notifications` block — merge onto the current defaults so a user who
// saved settings before these fields existed doesn't end up with holes
// the appearance/notification controls choke on.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateTweaks(raw: any): Tweaks {
  const theme: Tweaks['theme'] = raw?.theme ?? (raw?.darkMode ? 'dark' : 'light')
  return {
    ...DEFAULT_TWEAKS,
    ...raw,
    theme,
    notifications: { ...DEFAULT_TWEAKS.notifications, ...(raw?.notifications ?? {}) },
  }
}

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
  const [settingsReady, setSettingsReady] = useState(false)
  const [branding, setBranding] = useState<WhiteLabel | null>(null)
  const [brandingReady, setBrandingReady] = useState(false)

  const agentStatesRef = useRef(agentStates)
  const tweaksRef = useRef(tweaks)
  agentStatesRef.current = agentStates
  tweaksRef.current = tweaks

  const addToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3200)
  }, [])

  const { tasks, addTask, updateTask, deleteTask } = useTasks()
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  const openTaskModal = useCallback((task?: Task) => {
    setEditingTask(task ?? null)
    setTaskModalOpen(true)
  }, [])

  const playbookSender = useMemo(() => ({ name: user.name, company: user.org }), [user])
  const {
    playbooks, loading: playbooksLoading, stats: playbookStats, busy: playbookBusy,
    addPlaybook, editPlaybook, removePlaybook, setStatus: setPlaybookStatus,
    generateFromCrm, generateFromWeb,
  } = usePlaybooks(playbookSender, addToast)
  const [playbookModalOpen, setPlaybookModalOpen] = useState(false)
  const [editingPlaybook, setEditingPlaybook] = useState<Playbook | null>(null)
  const [playbookGeneratorOpen, setPlaybookGeneratorOpen] = useState(false)

  const openPlaybookModal = useCallback((pb?: Playbook) => {
    setEditingPlaybook(pb ?? null)
    setPlaybookModalOpen(true)
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
          if (data.tweaks) setTweaksState(migrateTweaks(data.tweaks))
        }
        setSettingsReady(true)
      })
  }, [userId, addToast])

  // Load white-label branding on mount. Unlike tweaks (auto-saved as you
  // change them), branding only changes when Settings > White Label calls
  // `setBranding` after a successful save (see the render below) — this
  // effect only needs to run once, to hydrate the app on open.
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('white_label_settings')
          .select('light_logo_url, dark_logo_url, favicon_url, primary_color, ink_color, font_choice, custom_font_name, custom_domain, domain_status, powered_by_badge')
          .eq('user_id', userId)
          .maybeSingle()
        if (error) addToast('Could not load your branding settings', 'error')
        else setBranding(data as WhiteLabel | null)
      } catch {
        // A network-level failure (backend unreachable) throws rather than
        // resolving with `error` — without this, White Label would be stuck
        // on "Loading…" forever instead of falling back to unbranded.
        addToast('Could not load your branding settings', 'error')
      } finally {
        setBrandingReady(true)
      }
    })()
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

  // Theme 'system' tracks the OS preference live.
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  const effectiveDark = tweaks.theme === 'dark' || (tweaks.theme === 'system' && systemDark)

  // Apply tweaks to DOM — a workspace's white-label branding (when set)
  // takes precedence over the personal accent/font tweaks above, same as
  // any branded product overrides an individual's local preferences.
  useEffect(() => {
    document.body.classList.toggle('dark', effectiveDark)

    const [a, ah] = ACCENTS[tweaks.accentColor] ?? ACCENTS.orange
    const accent = branding?.primary_color || a
    const accentHover = branding?.primary_color ? darkenHex(branding.primary_color, 0.12) : ah
    document.documentElement.style.setProperty('--orange', accent)
    document.documentElement.style.setProperty('--orange-h', accentHover)

    if (branding?.ink_color) {
      document.documentElement.style.setProperty('--ink', branding.ink_color)
    }

    const [headerH, sidebarW] = DENSITIES[tweaks.density] ?? DENSITIES.default
    document.documentElement.style.setProperty('--header-h', headerH)
    document.documentElement.style.setProperty('--sidebar-w', sidebarW)

    let fontStack = FONT_STACKS[tweaks.fontFamily] ?? FONT_STACKS.sans
    if (branding?.font_choice === 'inter') fontStack = FONT_STACKS.inter
    else if (branding?.font_choice === 'custom' && branding.custom_font_name) fontStack = `'${branding.custom_font_name}', sans-serif`
    document.body.style.setProperty('--font-body', fontStack)

    // Glass opacity — set on body (not documentElement) so the inline style
    // wins over the `body.dark { --glass: ... }` rule in index.css, which
    // otherwise shadows anything inherited from a lighter ancestor.
    const alpha = Math.min(95, Math.max(10, tweaks.glassOpacity)) / 100
    const [gr, gg, gb] = effectiveDark ? [20, 20, 20] : [255, 255, 255]
    document.body.style.setProperty('--glass', `rgba(${gr},${gg},${gb},${alpha})`)
    const hiAlpha = effectiveDark ? Math.min(0.5, alpha * 0.1) : Math.min(0.95, alpha * 1.17)
    document.body.style.setProperty('--glass-hi', `rgba(255,255,255,${hiAlpha.toFixed(2)})`)

    // Modals sit on top of a dark scrim (.modal-overlay) rather than the
    // page background, so letting them go as transparent as the ambient
    // glass preference allows makes their text unreadable — floor their
    // opacity independently of the slider while still letting a *more*
    // opaque preference carry through.
    const modalAlpha = Math.max(alpha, 0.92)
    document.body.style.setProperty('--modal-glass', `rgba(${gr},${gg},${gb},${modalAlpha})`)

    // These are applied imperatively to <body>/<html> rather than scoped to
    // this component's own DOM, so they must be cleaned up on sign-out —
    // otherwise a dark-mode / custom-glass preference would leak onto the
    // sign-in screen after AppShell unmounts.
    return () => {
      document.body.classList.remove('dark')
      document.body.style.removeProperty('--font-body')
      document.body.style.removeProperty('--glass')
      document.body.style.removeProperty('--glass-hi')
      document.body.style.removeProperty('--modal-glass')
      document.documentElement.style.removeProperty('--orange')
      document.documentElement.style.removeProperty('--orange-h')
      document.documentElement.style.removeProperty('--ink')
      document.documentElement.style.removeProperty('--header-h')
      document.documentElement.style.removeProperty('--sidebar-w')
    }
  }, [tweaks, effectiveDark, branding])

  // Favicon + a custom Google Font, when white-labeled — neither is a CSS
  // custom property, so these live outside the effect above. Gated on
  // brandingReady so a still-loading fetch doesn't briefly show/remove the
  // default favicon before the real branding (or lack of it) is known.
  useEffect(() => {
    if (!brandingReady) return
    const id = 'white-label-favicon'
    let link = document.getElementById(id) as HTMLLinkElement | null
    if (branding?.favicon_url) {
      if (!link) {
        link = document.createElement('link')
        link.id = id
        link.rel = 'icon'
        document.head.appendChild(link)
      }
      link.href = branding.favicon_url
    } else if (link) {
      link.remove()
    }
  }, [brandingReady, branding?.favicon_url])

  useEffect(() => {
    if (!brandingReady) return
    const id = 'white-label-font'
    let link = document.getElementById(id) as HTMLLinkElement | null
    if (branding?.font_choice === 'custom' && branding.custom_font_name) {
      const family = branding.custom_font_name.trim().replace(/\s+/g, '+')
      const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;500;600&display=swap`
      if (!link) {
        link = document.createElement('link')
        link.id = id
        link.rel = 'stylesheet'
        document.head.appendChild(link)
      }
      link.href = href
    } else if (link) {
      link.remove()
    }
  }, [brandingReady, branding?.font_choice, branding?.custom_font_name])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setNotifOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const sharedProps = { agentStates, toggleAgent, addToast }

  // Prefer the logo matching the current theme, falling back to the other
  // one if only a single logo was uploaded.
  const headerLogoUrl = effectiveDark
    ? (branding?.dark_logo_url || branding?.light_logo_url)
    : (branding?.light_logo_url || branding?.dark_logo_url)
  // Unbranded installs (no row yet) keep today's attribution unchanged; a
  // workspace that has set up branding can turn it off via the badge toggle.
  const poweredByVisible = !branding || branding.powered_by_badge

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppHeader user={user} onToggleNotif={() => setNotifOpen(p => !p)} notifOpen={notifOpen} logoUrl={headerLogoUrl} poweredByVisible={poweredByVisible}>
        <NotificationPanel />
      </AppHeader>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          view={view} setView={(v) => { setView(v); setNotifOpen(false) }} agentStates={agentStates} user={user} onLogout={onLogout}
          poweredByVisible={!!branding && branding.powered_by_badge}
        />

        <main className="main" onClick={() => setNotifOpen(false)}>
          <Dashboard         active={view === 'dashboard'}       onNavigate={setView} onNewTask={() => openTaskModal()} {...sharedProps} />
          <TasksView         active={view === 'tasks'}           tasks={tasks} onUpdateTask={updateTask} onDeleteTask={deleteTask} onOpenModal={openTaskModal} />
          <OutboundView      active={view === 'outbound'}         {...sharedProps} user={user} />
          <DemandView        active={view === 'demand'}           {...sharedProps} onNavigate={setView} />
          <SuccessView       active={view === 'success'}          {...sharedProps} onNavigate={setView} addTask={addTask} />
          <PlaybookAgentView active={view === 'playbook-agent'}   {...sharedProps} onNavigate={setView}
            playbooks={playbooks} stats={playbookStats}
            onNew={() => openPlaybookModal()} onGenerate={() => setPlaybookGeneratorOpen(true)} />
          <PlaybooksView     active={view === 'playbooks'}
            playbooks={playbooks} loading={playbooksLoading} stats={playbookStats}
            onNew={() => openPlaybookModal()} onGenerate={() => setPlaybookGeneratorOpen(true)}
            onEdit={openPlaybookModal} onDelete={removePlaybook} onSetStatus={setPlaybookStatus} />
          <ReportsView       active={view === 'reports'}          addToast={addToast} />
          <IntegrationsView  active={view === 'integrations'}     addToast={addToast} />
          <TeamView          active={view === 'team'}             addToast={addToast} user={user} />
          <SettingsView
            active={view === 'settings'} user={user} userId={userId} tweaks={tweaks} setTweak={setTweak} addToast={addToast} onLogout={onLogout}
            branding={branding} brandingReady={brandingReady} onBrandingSaved={setBranding}
          />
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

      <PlaybookModal
        isOpen={playbookModalOpen}
        onClose={() => setPlaybookModalOpen(false)}
        initial={editingPlaybook}
        onSubmit={(data) => {
          if (editingPlaybook) editPlaybook(editingPlaybook.id, data)
          else addPlaybook(data)
        }}
      />

      <PlaybookGeneratorModal
        isOpen={playbookGeneratorOpen}
        onClose={() => setPlaybookGeneratorOpen(false)}
        busy={playbookBusy}
        generateFromCrm={generateFromCrm}
        generateFromWeb={generateFromWeb}
        onSave={(input) => addPlaybook(input)}
      />
    </div>
  )
}
