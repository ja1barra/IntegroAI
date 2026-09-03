import { useState, useEffect, useRef } from 'react'
import type { Playbook, PlaybookInput, PlaybookStatus, Play } from '../../lib/playbooks/types'
import { PLAYBOOK_CATEGORIES } from '../../lib/playbooks/types'
import { Icon } from './Icon'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: PlaybookInput) => void
  initial?: Playbook | null
}

const STATUSES: { value: PlaybookStatus; label: string }[] = [
  { value: 'draft',    label: 'Draft' },
  { value: 'active',   label: 'Active' },
  { value: 'archived', label: 'Archived' },
]

const BLANK: PlaybookInput = {
  title: '',
  description: '',
  category: 'General',
  status: 'draft',
  source: 'manual',
  plays: [],
  tags: [],
  winRatePct: null,
  avgDealCycleDays: null,
  sourcesUsed: [],
  crmSummary: null,
}

function newPlay(): Play {
  return { id: crypto.randomUUID(), title: '', description: '' }
}

export default function PlaybookModal({ isOpen, onClose, onSubmit, initial }: Props) {
  const [form, setForm] = useState<PlaybookInput>(BLANK)
  const [tagInput, setTagInput] = useState('')
  const [error, setError] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setForm(initial ? {
      title: initial.title,
      description: initial.description,
      category: initial.category,
      status: initial.status,
      source: initial.source,
      plays: initial.plays.length ? initial.plays.map(p => ({ ...p })) : [newPlay()],
      tags: [...initial.tags],
      winRatePct: initial.winRatePct,
      avgDealCycleDays: initial.avgDealCycleDays,
      sourcesUsed: initial.sourcesUsed,
      crmSummary: initial.crmSummary,
    } : { ...BLANK, plays: [newPlay()] })
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

  const set = <K extends keyof PlaybookInput>(key: K, value: PlaybookInput[K]) =>
    setForm(p => ({ ...p, [key]: value }))

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/,/g, '')
    if (t && !form.tags.includes(t)) set('tags', [...form.tags, t])
    setTagInput('')
  }
  const removeTag = (tag: string) => set('tags', form.tags.filter(t => t !== tag))

  const updatePlay = (id: string, patch: Partial<Play>) =>
    set('plays', form.plays.map(p => p.id === id ? { ...p, ...patch } : p))
  const addPlay = () => set('plays', [...form.plays, newPlay()])
  const removePlay = (id: string) => set('plays', form.plays.filter(p => p.id !== id))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    const plays = form.plays
      .map(p => ({ ...p, title: p.title.trim(), description: p.description.trim() }))
      .filter(p => p.title || p.description)
    if (plays.length === 0) { setError('Add at least one play'); return }
    onSubmit({ ...form, title: form.title.trim(), plays })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" style={{ maxWidth: 560 }}>

        <div className="modal-header">
          <h2 className="modal-title">{initial ? 'Edit Playbook' : 'New Playbook'}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>

          <div className="form-group">
            <label className="form-label">
              Title <span style={{ color: 'var(--orange)' }}>*</span>
            </label>
            <input
              ref={titleRef}
              className={`form-input${error ? ' form-input-error' : ''}`}
              value={form.title}
              onChange={e => { set('title', e.target.value); setError('') }}
              placeholder="e.g. Mid-market discovery-to-close playbook"
            />
            {error && <div className="form-error">{error}</div>}
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-input form-textarea"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="When should a rep reach for this playbook?"
              rows={2}
            />
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Category</label>
              <select
                className="form-input form-select"
                value={form.category}
                onChange={e => set('category', e.target.value)}
              >
                {PLAYBOOK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="form-input form-select"
                value={form.status}
                onChange={e => set('status', e.target.value as PlaybookStatus)}
              >
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Plays */}
          <div className="form-group">
            <label className="form-label">Plays</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {form.plays.map((play, i) => (
                <div key={play.id} style={{ border: '1px solid var(--rule)', borderRadius: 8, padding: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: 'var(--ink-l)', fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>#{i + 1}</span>
                    <input
                      className="form-input"
                      style={{ padding: '6px 10px', fontSize: 13 }}
                      value={play.title}
                      onChange={e => updatePlay(play.id, { title: e.target.value })}
                      placeholder="Play title"
                    />
                    <button
                      type="button"
                      className="task-action-btn task-action-danger"
                      onClick={() => removePlay(play.id)}
                      title="Remove play"
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                  <textarea
                    className="form-input form-textarea"
                    style={{ minHeight: 50, fontSize: 13 }}
                    value={play.description}
                    onChange={e => updatePlay(play.id, { description: e.target.value })}
                    placeholder="What should the rep do?"
                    rows={2}
                  />
                </div>
              ))}
            </div>
            <button type="button" className="btn-sm btn-sm-ghost" style={{ marginTop: 8 }} onClick={addPlay}>
              + Add Play
            </button>
          </div>

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
              {initial ? 'Save Changes' : 'Create Playbook'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
