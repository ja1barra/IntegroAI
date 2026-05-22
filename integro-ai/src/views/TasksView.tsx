import { useState, useMemo } from 'react'
import type { Task, TaskStatus, TaskPriority, AgentId } from '../types'
import { Icon } from '../components/ui/Icon'
import EmptyState from '../components/ui/EmptyState'

interface Props {
  active: boolean
  tasks: Task[]
  onUpdateTask: (id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>) => void
  onDeleteTask: (id: string) => void
  onOpenModal: (task?: Task) => void
}

const STATUS_CFG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  'todo':        { label: 'To Do',       color: '#7a7268', bg: 'rgba(122,114,104,0.12)' },
  'in-progress': { label: 'In Progress', color: '#4d9de0', bg: 'rgba(77,157,224,0.12)'  },
  'review':      { label: 'Review',      color: '#9b59b6', bg: 'rgba(155,89,182,0.12)'  },
  'done':        { label: 'Done',        color: '#27a368', bg: 'rgba(62,207,142,0.12)'  },
  'blocked':     { label: 'Blocked',     color: '#e74c3c', bg: 'rgba(231,76,60,0.12)'   },
}

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  urgent: '#d4501a',
  high:   '#e74c3c',
  medium: '#f5a623',
  low:    '#27a368',
}

const PRIORITY_ORDER: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

const AGENT_LABEL: Partial<Record<AgentId, string>> = {
  outbound:         'Outbound Sales',
  demand:           'Demand Gen',
  success:          'Customer Success',
  'playbook-agent': 'Growth Playbooks',
}

const STATUS_CYCLE: TaskStatus[] = ['todo', 'in-progress', 'review', 'done']

const TABS: { value: TaskStatus | 'all'; label: string }[] = [
  { value: 'all',         label: 'All' },
  { value: 'todo',        label: 'To Do' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'review',      label: 'Review' },
  { value: 'done',        label: 'Done' },
  { value: 'blocked',     label: 'Blocked' },
]

function formatDue(dueDate: string) {
  if (!dueDate) return null
  const [y, m, d] = dueDate.split('-').map(Number)
  const due = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000)
  if (diff < 0)  return { text: `${Math.abs(diff)}d overdue`, cls: 'task-due-overdue' }
  if (diff === 0) return { text: 'Due today',    cls: 'task-due-soon' }
  if (diff === 1) return { text: 'Due tomorrow', cls: 'task-due-soon' }
  if (diff <= 7)  return { text: `Due in ${diff}d`, cls: 'task-due-soon' }
  return { text: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), cls: '' }
}

export default function TasksView({ active, tasks, onUpdateTask, onDeleteTask, onOpenModal }: Props) {
  const [tab, setTab]         = useState<TaskStatus | 'all'>('all')
  const [search, setSearch]   = useState('')
  const [sortBy, setSortBy]   = useState('created')
  const [deleting, setDeleting] = useState<string | null>(null)

  const counts = useMemo(() => ({
    total:      tasks.length,
    inProgress: tasks.filter(t => t.status === 'in-progress').length,
    done:       tasks.filter(t => t.status === 'done').length,
    overdue:    tasks.filter(t => {
      if (!t.dueDate || t.status === 'done') return false
      const [y, m, d] = t.dueDate.split('-').map(Number)
      return new Date(y, m - 1, d) < new Date(new Date().setHours(0, 0, 0, 0))
    }).length,
  }), [tasks])

  const filtered = useMemo(() => {
    let list = tab === 'all' ? tasks : tasks.filter(t => t.status === tab)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) ||
        t.tags.some(tag => tag.toLowerCase().includes(q))
      )
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'priority') return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      if (sortBy === 'due') {
        if (!a.dueDate && !b.dueDate) return 0
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return a.dueDate.localeCompare(b.dueDate)
      }
      return b.createdAt.localeCompare(a.createdAt)
    })
  }, [tasks, tab, search, sortBy])

  const cycleStatus = (task: Task) => {
    const idx = STATUS_CYCLE.indexOf(task.status)
    const next = idx === -1 ? 'todo' : STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    onUpdateTask(task.id, { status: next })
  }

  const tabCount = (v: TaskStatus | 'all') =>
    v === 'all' ? tasks.length : tasks.filter(t => t.status === v).length

  return (
    <div className={`view ${active ? 'active' : ''}`}>

      {/* Header */}
      <div className="view-header">
        <div>
          <div className="view-subtitle">Workspace</div>
          <h1 className="display view-title">Tasks</h1>
        </div>
        <div className="view-actions">
          <button className="btn-sm btn-sm-primary" onClick={() => onOpenModal()}>
            + New Task
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="task-stats-row">
        {[
          { label: 'Total',       value: counts.total,      color: 'var(--ink)'  },
          { label: 'In Progress', value: counts.inProgress, color: '#4d9de0'     },
          { label: 'Completed',   value: counts.done,       color: '#27a368'     },
          { label: 'Overdue',     value: counts.overdue,    color: '#e74c3c'     },
        ].map(s => (
          <div key={s.label} className="task-stat-item">
            <div className="task-stat-val" style={{ color: s.color }}>{s.value}</div>
            <div className="task-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="task-toolbar">
        <div className="task-search-wrap">
          <Icon
            name="search" size={13}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-l)', pointerEvents: 'none' }}
          />
          <input
            className="task-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks…"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="task-sort-label">Sort</span>
          <select
            className="form-input form-select task-sort-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
          >
            <option value="created">Created</option>
            <option value="due">Due Date</option>
            <option value="priority">Priority</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        {TABS.map(t => (
          <button
            key={t.value}
            className={`tab ${tab === t.value ? 'active' : ''}`}
            onClick={() => setTab(t.value)}
          >
            {t.label}
            {tabCount(t.value) > 0 && (
              <span className={`tab-count ${tab === t.value ? 'tab-count-active' : ''}`}>
                {tabCount(t.value)}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        tasks.length === 0 ? (
          <EmptyState
            icon="approvals"
            title="No tasks yet"
            desc="Create your first task to track work across your revenue OS."
            action={{ label: '+ New Task', onClick: () => onOpenModal() }}
          />
        ) : (
          <EmptyState
            icon="search"
            title="No matching tasks"
            desc="Try adjusting your search or filter."
          />
        )
      ) : (
        <div className="task-list">
          {filtered.map(task => {
            const due      = formatDue(task.dueDate)
            const status   = STATUS_CFG[task.status]
            const prioColor = PRIORITY_COLOR[task.priority]

            return (
              <div
                key={task.id}
                className="task-row"
                style={{ borderLeft: `3px solid ${prioColor}` }}
              >
                {/* Content */}
                <div className="task-row-main">
                  <div className="task-row-top">
                    <div
                      className="task-title"
                      onClick={() => onOpenModal(task)}
                      title="Click to edit"
                    >
                      {task.title}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {/* Status badge — click to cycle */}
                      <button
                        className="task-status-badge"
                        style={{ background: status.bg, color: status.color, borderColor: status.color + '44' }}
                        onClick={() => cycleStatus(task)}
                        title="Click to change status"
                      >
                        {status.label}
                      </button>

                      <button
                        className="task-action-btn"
                        onClick={() => onOpenModal(task)}
                        title="Edit task"
                      >
                        <Icon name="edit" size={12} />
                      </button>

                      <button
                        className="task-action-btn task-action-danger"
                        onClick={() => setDeleting(task.id)}
                        title="Delete task"
                      >
                        <Icon name="trash" size={12} />
                      </button>
                    </div>
                  </div>

                  {task.description && (
                    <div className="task-description">{task.description}</div>
                  )}

                  <div className="task-row-meta">
                    <span className="task-priority-label" style={{ color: prioColor }}>
                      {task.priority}
                    </span>

                    {task.agent && AGENT_LABEL[task.agent as AgentId] && (
                      <span className="task-agent-tag">
                        {AGENT_LABEL[task.agent as AgentId]}
                      </span>
                    )}

                    {due && (
                      <span className={`task-due-tag ${due.cls}`}>
                        <Icon name="clock" size={10} />
                        {due.text}
                      </span>
                    )}

                    {task.tags.map(tag => (
                      <span key={tag} className="task-tag">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Delete confirmation */}
      {deleting && (
        <div className="modal-overlay" onClick={() => setDeleting(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Delete Task</h2>
              <button className="modal-close" onClick={() => setDeleting(null)}>
                <Icon name="close" size={14} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: 'var(--ink-m)', marginBottom: 0 }}>
                Are you sure? This action cannot be undone.
              </p>
              <div className="modal-footer">
                <button className="btn-sm btn-sm-ghost" onClick={() => setDeleting(null)}>
                  Cancel
                </button>
                <button
                  className="btn-sm"
                  style={{ background: '#e74c3c', color: '#fff', border: 'none', cursor: 'pointer' }}
                  onClick={() => { onDeleteTask(deleting); setDeleting(null) }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
