import { useState } from 'react'
import StatCard from '../components/ui/StatCard'
import AgentPill from '../components/ui/AgentPill'
import EmptyState from '../components/ui/EmptyState'
import { Icon } from '../components/ui/Icon'
import SequenceBuilder, { type Sequence } from './outbound/SequenceBuilder'
import type { SharedViewProps } from '../types'

export default function OutboundView({ active, agentStates, toggleAgent, addToast }: SharedViewProps) {
  const [tab,       setTab]       = useState('overview')
  const [search,    setSearch]    = useState('')
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [building,  setBuilding]  = useState(false)
  const [editTarget, setEditTarget] = useState<Sequence | undefined>(undefined)

  const isRunning = agentStates.outbound === 'running'

  function handleSave(seq: Sequence) {
    setSequences(prev =>
      prev.some(s => s.id === seq.id)
        ? prev.map(s => s.id === seq.id ? seq : s)
        : [...prev, seq]
    )
    setBuilding(false)
    setEditTarget(undefined)
    addToast(`Sequence "${seq.name}" saved`, 'success')
  }

  function handleEdit(seq: Sequence) {
    setEditTarget(seq)
    setBuilding(true)
  }

  function handleDelete(id: string) {
    setSequences(prev => prev.filter(s => s.id !== id))
    addToast('Sequence deleted')
  }

  function handleActivate(id: string) {
    setSequences(prev =>
      prev.map(s => s.id === id ? { ...s, status: s.status === 'active' ? 'draft' : 'active' } : s)
    )
  }

  function openBuilder() {
    setEditTarget(undefined)
    setBuilding(true)
  }

  function cancelBuilder() {
    setBuilding(false)
    setEditTarget(undefined)
  }

  return (
    <div className={`view ${active ? 'active' : ''}`}>

      {/* ── Header ───────────────────────────────── */}
      <div className="agent-view-header">
        <div>
          <div className="agent-view-num">Agent 01</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="display agent-view-name">Outbound Sales Machine</div>
            <AgentPill status={agentStates.outbound} />
          </div>
          <div className="agent-view-sub">ICP identification · Sequence execution · Meeting booking · Handoff</div>
        </div>
        <div className="agent-controls">
          <button className="control-btn" onClick={() => { toggleAgent('outbound'); addToast(isRunning ? 'Agent paused' : 'Agent resumed') }}>
            {isRunning ? 'Pause Agent' : 'Resume Agent'}
          </button>
          <button className="control-btn">Settings</button>
          <button className="btn-sm btn-sm-primary" onClick={openBuilder}>+ New Sequence</button>
        </div>
      </div>

      {/* ── Stats ────────────────────────────────── */}
      <div className="stats-row">
        {[
          { label: 'In Sequence',     value: '--' },
          { label: 'Open Rate',       value: '--' },
          { label: 'Reply Rate',      value: '--' },
          { label: 'Meetings Booked', value: '--' },
        ].map(s => <StatCard key={s.label} {...s} active={active} />)}
      </div>

      {/* ── Tabs ─────────────────────────────────── */}
      <div className="tabs">
        {['overview', 'prospects', 'sequences'].map(t => (
          <div key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
            {t === 'sequences' && sequences.length > 0 && (
              <span className="tab-count">{sequences.length}</span>
            )}
          </div>
        ))}
      </div>

      {/* ── Overview tab ─────────────────────────── */}
      {tab === 'overview' && (
        <div className="card">
          <EmptyState
            icon="bolt"
            title="No outbound data yet"
            desc="Connect your CRM or outbound tool to start syncing prospects, sequences, and pipeline data."
            action={{ label: 'Connect Integrations', onClick: () => addToast('Go to Integrations in the sidebar') }}
          />
        </div>
      )}

      {/* ── Prospects tab ────────────────────────── */}
      {tab === 'prospects' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Prospects (0)</div>
            <input
              className="form-input"
              style={{ width: 200, padding: '6px 10px', fontSize: 12 }}
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <EmptyState
            icon="agents"
            title="No prospects yet"
            desc="Prospects will appear here once your CRM or outbound tool is connected."
          />
        </div>
      )}

      {/* ── Sequences tab ────────────────────────── */}
      {tab === 'sequences' && (
        <div className="card">
          {building ? (
            <>
              <div className="card-header">
                <div className="card-title">{editTarget ? 'Edit Sequence' : 'New Sequence'}</div>
                <button className="seq-builder-back" onClick={cancelBuilder}>
                  <Icon name="close" size={11} /> Cancel
                </button>
              </div>
              <SequenceBuilder
                onSave={handleSave}
                onCancel={cancelBuilder}
                initial={editTarget}
              />
            </>
          ) : (
            <>
              <div className="card-header">
                <div className="card-title">All Sequences ({sequences.length})</div>
                <div className="card-action" onClick={openBuilder}>+ Create</div>
              </div>

              {sequences.length === 0 ? (
                <EmptyState
                  icon="mail"
                  title="No sequences yet"
                  desc="Build a multi-step outreach sequence to automate personalized touchpoints."
                  action={{ label: '+ New Sequence', onClick: openBuilder }}
                />
              ) : (
                <div className="seq-list">
                  {sequences.map(seq => (
                    <SequenceItem
                      key={seq.id}
                      seq={seq}
                      onEdit={() => handleEdit(seq)}
                      onDelete={() => handleDelete(seq.id)}
                      onToggleActive={() => handleActivate(seq.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

    </div>
  )
}

// ── Sequence list item ────────────────────────────────────────

interface SequenceItemProps {
  seq: Sequence
  onEdit: () => void
  onDelete: () => void
  onToggleActive: () => void
}

function SequenceItem({ seq, onEdit, onDelete, onToggleActive }: SequenceItemProps) {
  const created = new Date(seq.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const stepCounts = {
    email:    seq.steps.filter(s => s.type === 'email').length,
    linkedin: seq.steps.filter(s => s.type === 'linkedin').length,
    call:     seq.steps.filter(s => s.type === 'call').length,
  }

  return (
    <div className="seq-item">
      <div className="seq-item-main">
        <div className="seq-item-top">
          <span className="seq-item-name">{seq.name}</span>
          <span className={`seq-status-badge ${seq.status === 'active' ? 'seq-status-active' : 'seq-status-draft'}`}>
            {seq.status}
          </span>
        </div>
        <div className="seq-item-meta">
          <span>{seq.steps.length} {seq.steps.length === 1 ? 'step' : 'steps'}</span>
          {stepCounts.email    > 0 && <span>{stepCounts.email} email{stepCounts.email > 1 ? 's' : ''}</span>}
          {stepCounts.linkedin > 0 && <span>{stepCounts.linkedin} LinkedIn</span>}
          {stepCounts.call     > 0 && <span>{stepCounts.call} call{stepCounts.call > 1 ? 's' : ''}</span>}
          <span>Created {created}</span>
        </div>
      </div>

      <div className="seq-item-actions">
        <button className="seq-item-btn" onClick={onToggleActive}>
          {seq.status === 'active' ? 'Pause' : 'Activate'}
        </button>
        <button className="seq-item-btn" onClick={onEdit}>
          <Icon name="edit" size={11} /> Edit
        </button>
        <button className="seq-item-btn seq-item-btn-danger" onClick={onDelete}>
          <Icon name="trash" size={11} />
        </button>
      </div>
    </div>
  )
}
