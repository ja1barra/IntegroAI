import { useState } from 'react'
import { Icon } from '../../components/ui/Icon'
import EmptyState from '../../components/ui/EmptyState'
import type { Message } from '../../lib/outbound/types'

interface Props {
  messages: Message[]
  busy: string | null
  mailboxConnected: boolean
  onEdit: (id: string, patch: { subject?: string; body?: string }) => void
  onApprove: (id: string) => void
  onDiscard: (id: string) => void
  onSendApproved: () => void
  onConnectMailbox: () => void
}

export default function ReviewTab({ messages, busy, mailboxConnected, onEdit, onApprove, onDiscard, onSendApproved, onConnectMailbox }: Props) {
  const drafts   = messages.filter(m => m.status === 'draft')
  const approved = messages.filter(m => m.status === 'approved')
  const sent     = messages.filter(m => m.status === 'sent')
  const failed   = messages.filter(m => m.status === 'failed')
  const sending  = busy === 'send'

  const queue = [...drafts, ...approved]

  if (messages.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon="mail"
          title="Nothing to review"
          desc="Select prospects on the Prospects tab and click “Enroll & Generate” to create AI-personalized drafts here."
        />
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">
          Review Queue — {drafts.length} draft{drafts.length === 1 ? '' : 's'}, {approved.length} approved
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {(sent.length > 0 || failed.length > 0) && (
            <span style={{ fontSize: 11, color: 'var(--ink-l)' }}>
              {sent.length} sent{failed.length ? ` · ${failed.length} failed` : ''}
            </span>
          )}
          <button
            className={`ob-mailbox-chip${mailboxConnected ? ' ob-mailbox-on' : ''}`}
            onClick={onConnectMailbox}
            disabled={busy === 'mailbox'}
            title={mailboxConnected ? 'Mailbox connected' : 'Connect a Gmail mailbox to send for real'}
          >
            <Icon name={mailboxConnected ? 'checkCircle' : 'mail'} size={12} />
            {busy === 'mailbox' ? 'Connecting…' : mailboxConnected ? 'Mailbox connected' : 'Connect mailbox'}
          </button>
          <button
            className="btn-sm btn-sm-primary"
            disabled={approved.length === 0 || sending}
            onClick={onSendApproved}
          >
            {sending ? 'Sending…' : `Send ${approved.length || ''} approved`}
          </button>
        </div>
      </div>

      <div className="ob-review-list">
        {queue.map(m => (
          <ReviewCard key={m.id} msg={m} onEdit={onEdit} onApprove={onApprove} onDiscard={onDiscard} />
        ))}
      </div>

      {sent.length > 0 && (
        <details className="ob-sent">
          <summary>Sent ({sent.length})</summary>
          {sent.map(m => (
            <div key={m.id} className="ob-sent-row">
              <Icon name="checkCircle" size={13} />
              <span className="ob-name">{m.prospect ? `${m.prospect.firstName} ${m.prospect.lastName}` : m.prospectId}</span>
              <span className="ob-sub">{m.subject}</span>
              {m.mailbox === 'demo' && <span className="ob-tag">simulated</span>}
            </div>
          ))}
        </details>
      )}
    </div>
  )
}

function ReviewCard({ msg, onEdit, onApprove, onDiscard }: {
  msg: Message
  onEdit: (id: string, patch: { subject?: string; body?: string }) => void
  onApprove: (id: string) => void
  onDiscard: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [subject, setSubject] = useState(msg.subject)
  const [body, setBody]       = useState(msg.body)

  const name = msg.prospect ? `${msg.prospect.firstName} ${msg.prospect.lastName}`.trim() : 'Prospect'
  const isApproved = msg.status === 'approved'

  function save() {
    onEdit(msg.id, { subject, body })
    setEditing(false)
  }

  return (
    <div className={`ob-review-card${isApproved ? ' ob-approved' : ''}`}>
      <div className="ob-review-head">
        <div style={{ minWidth: 0 }}>
          <div className="ob-name">{name} <span className="ob-sub">· {msg.prospect?.company}</span></div>
          <div className="ob-sub">{msg.prospect?.email}</div>
        </div>
        <div className="ob-review-badges">
          {msg.generatedBy === 'ai' && <span className="ob-tag ob-tag-ai">AI</span>}
          <span className={`pstatus pstatus-${isApproved ? 'meeting' : 'new'}`}>{isApproved ? 'Approved' : 'Draft'}</span>
        </div>
      </div>

      {editing ? (
        <>
          <input className="form-input" style={{ marginBottom: 8 }} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" />
          <textarea className="seq-body-input" rows={7} value={body} onChange={e => setBody(e.target.value)} />
          <div className="ob-review-actions">
            <button className="control-btn" onClick={() => { setSubject(msg.subject); setBody(msg.body); setEditing(false) }}>Cancel</button>
            <button className="btn-sm btn-sm-primary" onClick={save}>Save</button>
          </div>
        </>
      ) : (
        <>
          <div className="ob-review-subject">{msg.subject}</div>
          <div className="ob-review-body">{msg.body}</div>
          <div className="ob-review-actions">
            <button className="seq-item-btn seq-item-btn-danger" onClick={() => onDiscard(msg.id)}><Icon name="trash" size={11} /> Discard</button>
            <div style={{ flex: 1 }} />
            <button className="seq-item-btn" onClick={() => setEditing(true)}><Icon name="edit" size={11} /> Edit</button>
            {!isApproved && <button className="btn-sm btn-sm-primary" onClick={() => onApprove(msg.id)}>Approve</button>}
          </div>
        </>
      )}
    </div>
  )
}
