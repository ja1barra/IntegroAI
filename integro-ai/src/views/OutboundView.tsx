import { useState, useMemo } from 'react'
import StatCard from '../components/ui/StatCard'
import AgentPill from '../components/ui/AgentPill'
import { Icon } from '../components/ui/Icon'
import SequenceBuilder from './outbound/SequenceBuilder'
import ProspectsTab from './outbound/ProspectsTab'
import ReviewTab from './outbound/ReviewTab'
import { useOutbound } from '../hooks/useOutbound'
import type { SharedViewProps, User } from '../types'
import type { Sequence } from '../lib/outbound/types'

export default function OutboundView({ active, agentStates, toggleAgent, addToast, user }: SharedViewProps & { user: User }) {
  const sender = useMemo(() => ({ name: user.name, company: user.org }), [user])
  const ob = useOutbound(sender, addToast)

  const [tab, setTab]           = useState('overview')
  const [building, setBuilding] = useState(false)
  const [editTarget, setEditTarget] = useState<Sequence | undefined>(undefined)

  const isRunning = agentStates.outbound === 'running'

  function openBuilder() {
    setEditTarget(undefined)
    setBuilding(true)
    setTab('sequences')
  }
  function cancelBuilder() { setBuilding(false); setEditTarget(undefined) }

  async function handleSave(seq: Sequence) {
    await ob.saveSequence(seq)
    setBuilding(false)
    setEditTarget(undefined)
  }

  const draftCount = ob.messages.filter(m => m.status === 'draft' || m.status === 'approved').length + ob.dueFollowups.length

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
          <div className="agent-view-sub">ICP sync · AI sequencing · Human review · Auto-send</div>
        </div>
        <div className="agent-controls">
          <button className="control-btn" onClick={() => { toggleAgent('outbound'); addToast(isRunning ? 'Agent paused' : 'Agent resumed') }}>
            {isRunning ? 'Pause Agent' : 'Resume Agent'}
          </button>
          <button className="btn-sm btn-sm-primary" onClick={openBuilder}>+ New Sequence</button>
        </div>
      </div>

      {/* ── Stats ────────────────────────────────── */}
      <div className="stats-row">
        <StatCard label="In Sequence"     value={String(ob.stats.inSequence)} active={active} />
        <StatCard label="Emails Sent"     value={String(ob.stats.sent)} active={active} />
        <StatCard label="Reply Rate"      value={String(ob.stats.replyRate)} unit="%" active={active} />
        <StatCard label="Meetings Booked" value={String(ob.stats.meetings)} active={active} />
      </div>

      {/* ── Tabs ─────────────────────────────────── */}
      <div className="tabs">
        {[
          { k: 'overview',  label: 'Overview' },
          { k: 'prospects', label: 'Prospects', count: ob.prospects.length },
          { k: 'sequences', label: 'Sequences', count: ob.sequences.length },
          { k: 'review',    label: 'Review',    count: draftCount },
        ].map(t => (
          <div key={t.k} className={`tab ${tab === t.k ? 'active' : ''}`} onClick={() => setTab(t.k)}>
            {t.label}
            {!!t.count && t.count > 0 && <span className={`tab-count ${tab === t.k ? 'tab-count-active' : ''}`}>{t.count}</span>}
          </div>
        ))}
      </div>

      {ob.loading ? (
        <div className="card"><div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-l)' }}>Loading…</div></div>
      ) : (
        <>
          {tab === 'overview' && <Overview ob={ob} onGoto={setTab} onNewSequence={openBuilder} />}

          {tab === 'prospects' && (
            <ProspectsTab
              prospects={ob.prospects}
              sequences={ob.sequences}
              busy={ob.busy}
              onSync={ob.syncProspects}
              onAddProspect={ob.addProspect}
              onRemove={ob.removeProspect}
              onEnrollGenerate={(sid, ids) => { ob.enrollAndGenerate(sid, ids); setTab('review') }}
            />
          )}

          {tab === 'sequences' && (
            <div className="card">
              {building ? (
                <>
                  <div className="card-header">
                    <div className="card-title">{editTarget ? 'Edit Sequence' : 'New Sequence'}</div>
                    <button className="seq-builder-back" onClick={cancelBuilder}><Icon name="close" size={11} /> Cancel</button>
                  </div>
                  <SequenceBuilder onSave={handleSave} onCancel={cancelBuilder} initial={editTarget} />
                </>
              ) : (
                <>
                  <div className="card-header">
                    <div className="card-title">All Sequences ({ob.sequences.length})</div>
                    <div className="card-action" onClick={openBuilder}>+ Create</div>
                  </div>
                  {ob.sequences.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--ink-l)' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8, color: 'var(--orange)' }}>
                        <Icon name="mail" size={34} />
                      </div>
                      <div style={{ fontSize: 14, marginBottom: 4, color: 'var(--ink)' }}>No sequences yet</div>
                      <div style={{ fontSize: 12, marginBottom: 14 }}>Build a multi-step outreach sequence to automate personalized touchpoints.</div>
                      <button className="btn-sm btn-sm-primary" onClick={openBuilder}>+ New Sequence</button>
                    </div>
                  ) : (
                    <div className="seq-list">
                      {ob.sequences.map(seq => (
                        <SequenceItem
                          key={seq.id}
                          seq={seq}
                          onEdit={() => { setEditTarget(seq); setBuilding(true) }}
                          onDelete={() => ob.removeSequence(seq.id)}
                          onToggleActive={() => ob.toggleSequenceActive(seq.id)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'review' && (
            <ReviewTab
              messages={ob.messages}
              busy={ob.busy}
              mailboxConnected={ob.mailboxConnected}
              dueFollowups={ob.dueFollowups}
              upcomingFollowups={ob.upcomingFollowups}
              onEdit={ob.editMessage}
              onApprove={ob.approveMessage}
              onDiscard={ob.discardMessage}
              onSendApproved={ob.sendApproved}
              onConnectMailbox={ob.connectMailbox}
              onPrepareFollowups={ob.prepareDueFollowups}
            />
          )}
        </>
      )}
    </div>
  )
}

// ── Overview: getting-started checklist reflecting real state ──
function Overview({ ob, onGoto, onNewSequence }: {
  ob: ReturnType<typeof useOutbound>
  onGoto: (t: string) => void
  onNewSequence: () => void
}) {
  const hasProspects = ob.prospects.length > 0
  const hasSequence  = ob.sequences.length > 0
  const hasDrafts    = ob.messages.length > 0
  const hasSent      = ob.stats.sent > 0

  const steps = [
    { done: hasProspects, title: 'Sync prospects',   desc: 'Pull contacts from your CRM (HubSpot / Apollo) or add them manually.', cta: 'Prospects', go: () => onGoto('prospects') },
    { done: hasSequence,  title: 'Build a sequence',  desc: 'Create a multi-step email sequence the agent will personalize per prospect.', cta: 'New Sequence', go: onNewSequence },
    { done: hasDrafts,    title: 'Generate & review', desc: 'Enroll prospects to generate AI-personalized drafts, then review them.', cta: 'Review', go: () => onGoto('review') },
    { done: hasSent,      title: 'Send',              desc: 'Approve drafts and send through your connected mailbox.', cta: 'Review', go: () => onGoto('review') },
  ]
  const completed = steps.filter(s => s.done).length

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Getting started · {completed}/{steps.length} complete</div>
      </div>
      <div className="ob-checklist">
        {steps.map((s, i) => (
          <div key={i} className={`ob-check ${s.done ? 'ob-check-done' : ''}`}>
            <div className="ob-check-icon">
              {s.done ? <Icon name="checkCircle" size={20} /> : <span className="ob-check-num">{i + 1}</span>}
            </div>
            <div style={{ flex: 1 }}>
              <div className="ob-check-title">{s.title}</div>
              <div className="ob-check-desc">{s.desc}</div>
            </div>
            {!s.done && <button className="control-btn" onClick={s.go}>{s.cta}</button>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Sequence list item ────────────────────────────────────────
function SequenceItem({ seq, onEdit, onDelete, onToggleActive }: {
  seq: Sequence
  onEdit: () => void
  onDelete: () => void
  onToggleActive: () => void
}) {
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
          <span className={`seq-status-badge ${seq.status === 'active' ? 'seq-status-active' : 'seq-status-draft'}`}>{seq.status}</span>
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
        <button className="seq-item-btn" onClick={onToggleActive}>{seq.status === 'active' ? 'Pause' : 'Activate'}</button>
        <button className="seq-item-btn" onClick={onEdit}><Icon name="edit" size={11} /> Edit</button>
        <button className="seq-item-btn seq-item-btn-danger" onClick={onDelete}><Icon name="trash" size={11} /></button>
      </div>
    </div>
  )
}
