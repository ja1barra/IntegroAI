import { useState, useMemo } from 'react'
import { Icon } from '../../components/ui/Icon'
import EmptyState from '../../components/ui/EmptyState'
import type { Prospect, Sequence, ProspectInput } from '../../lib/outbound/types'

interface Props {
  prospects: Prospect[]
  sequences: Sequence[]
  busy: string | null
  onSync: () => void
  onAddProspect: (input: ProspectInput) => void
  onRemove: (id: string) => void
  onEnrollGenerate: (sequenceId: string, prospectIds: string[]) => void
}

const STATUS_LABEL: Record<string, string> = {
  new: 'New', enrolled: 'Enrolled', contacted: 'Contacted',
  replied: 'Replied', meeting: 'Meeting', bounced: 'Bounced', unsubscribed: 'Unsub',
}

export default function ProspectsTab({ prospects, sequences, busy, onSync, onAddProspect, onRemove, onEnrollGenerate }: Props) {
  const [search, setSearch]   = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [adding, setAdding]   = useState(false)
  const [seqId, setSeqId]     = useState('')

  const activeSequences = sequences.filter(s => s.steps.some(st => st.type === 'email'))

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return prospects
    return prospects.filter(p =>
      `${p.firstName} ${p.lastName} ${p.email} ${p.company} ${p.title}`.toLowerCase().includes(q),
    )
  }, [prospects, search])

  const allSelected = filtered.length > 0 && filtered.every(p => selected.has(p.id))

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(filtered.map(p => p.id)))
  }

  function handleEnroll() {
    const target = seqId || activeSequences[0]?.id
    if (!target) return
    onEnrollGenerate(target, [...selected])
    setSelected(new Set())
  }

  const syncing = busy === 'sync'
  const generating = busy === 'generate'

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Prospects ({prospects.length})</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="form-input"
            style={{ width: 200, padding: '6px 10px', fontSize: 12 }}
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="control-btn" onClick={() => setAdding(a => !a)}>+ Add</button>
          <button className="btn-sm btn-sm-primary" onClick={onSync} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync from CRM'}
          </button>
        </div>
      </div>

      {adding && <AddProspectForm onAdd={(p) => { onAddProspect(p); setAdding(false) }} onCancel={() => setAdding(false)} />}

      {prospects.length === 0 ? (
        <EmptyState
          icon="agents"
          title="No prospects yet"
          desc="Sync prospects from a connected CRM (HubSpot / Apollo), or add them manually to get started."
          action={{ label: syncing ? 'Syncing…' : 'Sync from CRM', onClick: onSync }}
        />
      ) : (
        <>
          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="ob-actionbar">
              <span className="ob-actionbar-count">{selected.size} selected</span>
              <div style={{ flex: 1 }} />
              {activeSequences.length > 0 ? (
                <>
                  <select className="form-input ob-seq-select" value={seqId} onChange={e => setSeqId(e.target.value)}>
                    {activeSequences.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button className="btn-sm btn-sm-primary" onClick={handleEnroll} disabled={generating}>
                    {generating ? 'Generating…' : 'Enroll & Generate'}
                  </button>
                </>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--ink-l)' }}>Create an email sequence first to enroll</span>
              )}
            </div>
          )}

          <table className="otbl">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                </th>
                <th>Name</th>
                <th>Title</th>
                <th>Company</th>
                <th>Status</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className={selected.has(p.id) ? 'ob-row-sel' : ''}>
                  <td><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.email}`} /></td>
                  <td>
                    <div className="ob-name">{p.firstName} {p.lastName}</div>
                    <div className="ob-sub">{p.email}</div>
                  </td>
                  <td className="ob-cell">{p.title || '—'}</td>
                  <td className="ob-cell">{p.company || '—'}</td>
                  <td><span className={`pstatus pstatus-${p.status}`}>{STATUS_LABEL[p.status] ?? p.status}</span></td>
                  <td>
                    <button className="seq-item-btn seq-item-btn-danger" title="Remove" onClick={() => onRemove(p.id)}>
                      <Icon name="trash" size={11} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

function AddProspectForm({ onAdd, onCancel }: { onAdd: (p: ProspectInput) => void; onCancel: () => void }) {
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', title: '', company: '' })
  const valid = f.email.includes('@')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(p => ({ ...p, [k]: e.target.value }))
  return (
    <div className="ob-addform">
      <input className="form-input" placeholder="First name" value={f.firstName} onChange={set('firstName')} />
      <input className="form-input" placeholder="Last name"  value={f.lastName}  onChange={set('lastName')} />
      <input className="form-input" placeholder="Email *"     value={f.email}     onChange={set('email')} />
      <input className="form-input" placeholder="Title"       value={f.title}     onChange={set('title')} />
      <input className="form-input" placeholder="Company"     value={f.company}   onChange={set('company')} />
      <button className="btn-sm btn-sm-primary" disabled={!valid} onClick={() => onAdd({ ...f, source: 'manual' })}>Add</button>
      <button className="control-btn" onClick={onCancel}>Cancel</button>
    </div>
  )
}
