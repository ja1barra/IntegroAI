import { useState, useEffect, useRef } from 'react'
import type { Task, TaskStatus, TaskPriority, AgentId } from '../../types'
import { Icon } from './Icon'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => void
  initial?: Task | null
}

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'todo',        label: 'To Do' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'review',      label: 'Review' },
  { value: 'done',        label: 'Done' },
  { value: 'blocked',     label: 'Blocked' },
]

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high',   label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low',    label: 'Low' },
]

const AGENTS: { value: AgentId | ''; label: string }[] = [
  { value: '',               label: 'No agent' },
  { value: 'outbound',       label: 'Outbound Sales' },
  { value: 'demand',         label: 'Demand Gen' },
  { value: 'success',        label: 'Customer Success' },
  { value: 'playbook-agent', label: 'Growth Playbooks' },
]

const BLANK = {
  title: '',
  description: '',
  status: 'todo' as TaskStatus,
  priority: 'medium' as TaskPriority,
  dueDate: '',
  agent: '' as AgentId | '',
  tags: [] as string[],
}

export default function TaskCreatorModal({ isOpen, onClose, onSubmit, initial }: Props) {
  const [form, setForm] = useState(BLANK)
  const [tagInput, setTagInput] = useState('')
  const [error, setError] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setForm(initial ? {
      title: initial.title,
      description: initial.description,
      status: initial.status,
      priority: initial.priority,
      dueDate: initial.dueDate,
      agent: initial.agent,
      tags: [...initial.tags],
    } : BLANK)
    setTagInput('')
    setError('')
    setTimeout(() => titleRef.current?.focus(), 60)
  }, [isOpen, initial])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && isOpen) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const set = (key: keyof typeof form, value: unknown) =>
    setForm(p => ({ ...p, [key]: value }))

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/,/g, '')
    if (t && !form.tags.includes(t)) set('tags', [...form.tags, t])
    setTagInput('')
  }

  const removeTag = (tag: string) =>
    set('tags', form.tags.filter(t => t !== tag))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    onSubmit({ ...form, title: form.title.trim() })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">

        <div className="modal-header">
          <h2 className="modal-title">{initial ? 'Edit Task' : 'New Task'}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">

          {/* Title */}
          <div className="form-group">
            <label className="form-label">
              Title <span style={{ color: 'var(--orange)' }}>*</span>
            </label>
            <input
              ref={titleRef}
              className={`form-input${error ? ' form-input-error' : ''}`}
              value={form.title}
              onChange={e => { set('title', e.target.value); setError('') }}
              placeholder="What needs to be done?"
            />
            {error && <div className="form-error">{error}</div>}
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-input form-textarea"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Add details, context, or links…"
              rows={3}
            />
          </div>

          {/* Status + Priority */}
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="form-input form-select"
                value={form.status}
                onChange={e => set('status', e.target.value as TaskStatus)}
              >
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <select
                className="form-input form-select"
                value={form.priority}
                onChange={e => set('priority', e.target.value as TaskPriority)}
              >
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          {/* Due Date + Agent */}
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Due Date</label>
              <input
                type="date"
                className="form-input form-select"
                value={form.dueDate}
                onChange={e => set('dueDate', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Related Agent</label>
              <select
                className="form-input form-select"
                value={form.agent}
                onChange={e => set('agent', e.target.value as AgentId | '')}
              >
                {AGENTS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div className="form-group">
            <label className="form-label">Tags</label>
            <div className="tag-input-wrap">
              {form.tags.map(t => (
                <span key={t} className="task-tag task-tag-removable">
                  {t}
                  <button type="button" className="tag-remove" onClick={() => removeTag(t)}>
                    <Icon name="close" size={9} />
                  </button>
                </span>
              ))}
              <input
                className="tag-input"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput) }
                  if (e.key === 'Backspace' && !tagInput && form.tags.length > 0) {
                    removeTag(form.tags[form.tags.length - 1])
                  }
                }}
                onBlur={() => { if (tagInput.trim()) addTag(tagInput) }}
                placeholder={form.tags.length === 0 ? 'Add tags (press Enter or comma)…' : ''}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-sm btn-sm-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-sm btn-sm-primary">
              {initial ? 'Save Changes' : 'Create Task'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
