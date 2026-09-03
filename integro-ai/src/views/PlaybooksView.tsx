import { useState, useMemo } from 'react'
import type { Playbook, PlaybookStatus } from '../lib/playbooks/types'
import { Icon } from '../components/ui/Icon'
import EmptyState from '../components/ui/EmptyState'

interface Props {
  active: boolean
  playbooks: Playbook[]
  loading: boolean
  stats: { total: number; active: number; avgWinRate: number | null; avgDealCycleDays: number | null }
  onNew: () => void
  onGenerate: () => void
  onEdit: (pb: Playbook) => void
  onDelete: (id: string) => void
  onSetStatus: (id: string, status: PlaybookStatus) => void
}

const STATUS_CFG: Record<PlaybookStatus, { label: string; color: string; bg: string }> = {
  draft:    { label: 'Draft',    color: '#7a7268', bg: 'rgba(122,114,104,0.12)' },
  active:   { label: 'Active',   color: '#27a368', bg: 'rgba(62,207,142,0.12)' },
  archived: { label: 'Archived', color: '#9b59b6', bg: 'rgba(155,89,182,0.12)' },
}

const STATUS_CYCLE: PlaybookStatus[] = ['draft', 'active', 'archived']

const SOURCE_CFG: Record<Playbook['source'], { label: string; icon: 'edit' | 'bolt' | 'search' }> = {
  manual: { label: 'Manual', icon: 'edit' },
  ai_crm: { label: 'AI · CRM', icon: 'bolt' },
  ai_web: { label: 'AI · Web', icon: 'search' },
}

const TABS: { value: PlaybookStatus | 'all'; label: string }[] = [
  { value: 'all',      label: 'All' },
  { value: 'active',   label: 'Active' },
  { value: 'draft',    label: 'Draft' },
  { value: 'archived', label: 'Archived' },
]

export default function PlaybooksView({ active, playbooks, loading, stats, onNew, onGenerate, onEdit, onDelete, onSetStatus }: Props) {
  const [tab, setTab] = useState<PlaybookStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let list = tab === 'all' ? playbooks : playbooks.filter(p => p.status === tab)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) || p.tags.some(t => t.toLowerCase().includes(q))
      )
    }
    return list
  }, [playbooks, tab, search])

  const tabCount = (v: PlaybookStatus | 'all') =>
    v === 'all' ? playbooks.length : playbooks.filter(p => p.status === v).length

  const cycleStatus = (pb: Playbook) => {
    const idx = STATUS_CYCLE.indexOf(pb.status)
    onSetStatus(pb.id, STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length])
  }

  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="view-header">
        <div><div className="view-subtitle">Strategy Library</div><h1 className="display view-title">Playbooks</h1></div>
        <div className="view-actions" style={{ display: 'flex', gap: 8 }}>
          <button className="btn-sm btn-sm-ghost" onClick={onGenerate}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="sparkles" size={12} /> Generate with AI
            </span>
          </button>
          <button className="btn-sm btn-sm-primary" onClick={onNew}>+ New Playbook</button>
        </div>
      </div>

      {playbooks.length > 0 && (
        <div className="task-stats-row">
          {[
            { label: 'Total',          value: stats.total },
            { label: 'Active',         value: stats.active },
            { label: 'Avg Win Rate',   value: stats.avgWinRate !== null ? `${stats.avgWinRate}%` : '—' },
            { label: 'Avg Deal Cycle', value: stats.avgDealCycleDays !== null ? `${stats.avgDealCycleDays}d` : '—' },
          ].map(s => (
            <div key={s.label} className="task-stat-item">
              <div className="task-stat-val">{s.value}</div>
              <div className="task-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {playbooks.length > 0 && (
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
              placeholder="Search playbooks…"
            />
          </div>
        </div>
      )}

      {playbooks.length > 0 && (
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
      )}

      {!loading && playbooks.length === 0 && (
        <div className="card">
          <EmptyState
            icon="playbook"
            title="No playbooks yet"
            desc="Create your first playbook manually, or let the Growth Playbooks agent generate one from your CRM data or live web research."
            action={{ label: '+ New Playbook', onClick: onNew }}
          />
        </div>
      )}

      {!loading && playbooks.length > 0 && filtered.length === 0 && (
        <EmptyState icon="search" title="No matching playbooks" desc="Try adjusting your search or filter." />
      )}

      {filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {filtered.map(pb => {
            const status = STATUS_CFG[pb.status]
            const src = SOURCE_CFG[pb.source]
            return (
              <div key={pb.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{ fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                      onClick={() => onEdit(pb)}
                      title="Click to edit"
                    >
                      {pb.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-l)', marginTop: 2 }}>{pb.category}</div>
                  </div>
                  <button
                    className="task-status-badge"
                    style={{ background: status.bg, color: status.color, borderColor: status.color + '44', flexShrink: 0 }}
                    onClick={() => cycleStatus(pb)}
                    title="Click to change status"
                  >
                    {status.label}
                  </button>
                </div>

                {pb.description && (
                  <div style={{ fontSize: 12.5, color: 'var(--ink-m)', lineHeight: 1.5 }}>{pb.description}</div>
                )}

                <div style={{ fontSize: 12, color: 'var(--ink-l)' }}>
                  {pb.plays.length} {pb.plays.length === 1 ? 'play' : 'plays'}
                  {pb.winRatePct !== null && ` · ${pb.winRatePct}% win rate`}
                  {pb.avgDealCycleDays !== null && ` · ${pb.avgDealCycleDays}d cycle`}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <span className="task-agent-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Icon name={src.icon} size={10} /> {src.label}
                  </span>
                  {pb.tags.map(t => <span key={t} className="task-tag">{t}</span>)}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 'auto' }}>
                  <button className="task-action-btn" onClick={() => onEdit(pb)} title="Edit playbook">
                    <Icon name="edit" size={12} />
                  </button>
                  <button className="task-action-btn task-action-danger" onClick={() => setDeleting(pb.id)} title="Delete playbook">
                    <Icon name="trash" size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {deleting && (
        <div className="modal-overlay" onClick={() => setDeleting(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Delete Playbook</h2>
              <button className="modal-close" onClick={() => setDeleting(null)}>
                <Icon name="close" size={14} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: 'var(--ink-m)', marginBottom: 0 }}>
                Are you sure? This action cannot be undone.
              </p>
              <div className="modal-footer">
                <button className="btn-sm btn-sm-ghost" onClick={() => setDeleting(null)}>Cancel</button>
                <button
                  className="btn-sm"
                  style={{ background: '#e74c3c', color: '#fff', border: 'none', cursor: 'pointer' }}
                  onClick={() => { onDelete(deleting); setDeleting(null) }}
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
