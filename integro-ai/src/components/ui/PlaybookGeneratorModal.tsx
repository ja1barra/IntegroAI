import { useState, useEffect } from 'react'
import type { PlaybookInput } from '../../lib/playbooks/types'
import { Icon } from './Icon'

type GenMode = 'crm' | 'web'

interface Draft { input: PlaybookInput; demo: boolean }

interface Props {
  isOpen: boolean
  onClose: () => void
  busy: string | null
  generateFromCrm: (topic?: string) => Promise<Draft | null>
  generateFromWeb: (topic: string) => Promise<Draft | null>
  onSave: (input: PlaybookInput) => void
}

export default function PlaybookGeneratorModal({ isOpen, onClose, busy, generateFromCrm, generateFromWeb, onSave }: Props) {
  const [mode, setMode] = useState<GenMode>('crm')
  const [topic, setTopic] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setMode('crm')
    setTopic('')
    setDraft(null)
    setError('')
  }, [isOpen])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && isOpen) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const generating = busy === 'crm' || busy === 'web'

  const handleGenerate = async () => {
    setError('')
    if (mode === 'web' && !topic.trim()) { setError('Describe what to research first'); return }
    const result = mode === 'crm' ? await generateFromCrm(topic.trim() || undefined) : await generateFromWeb(topic.trim())
    if (result) setDraft(result)
  }

  const handleSave = () => {
    if (!draft) return
    onSave(draft.input)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" style={{ maxWidth: 560 }}>

        <div className="modal-header">
          <h2 className="modal-title">Generate Playbook</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>

          {!draft && (
            <>
              <div className="form-group">
                <label className="form-label">Source</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setMode('crm')}
                    className="card"
                    style={{
                      textAlign: 'left', cursor: 'pointer', padding: 14, width: '100%',
                      font: 'inherit', color: 'inherit',
                      border: mode === 'crm' ? '1.5px solid var(--orange)' : '1px solid var(--rule)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Icon name="bolt" size={13} />
                      <span style={{ fontWeight: 600, fontSize: 13 }}>CRM Data</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-l)', lineHeight: 1.5 }}>
                      Analyze your connected CRM's win/loss patterns to draft tactical plays.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('web')}
                    className="card"
                    style={{
                      textAlign: 'left', cursor: 'pointer', padding: 14, width: '100%',
                      font: 'inherit', color: 'inherit',
                      border: mode === 'web' ? '1.5px solid var(--orange)' : '1px solid var(--rule)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Icon name="search" size={12} />
                      <span style={{ fontWeight: 600, fontSize: 13 }}>Online Research</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-l)', lineHeight: 1.5 }}>
                      Research current best practices on the web for a topic you choose.
                    </div>
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  {mode === 'crm' ? 'Focus area (optional)' : 'Topic to research'}
                  {mode === 'web' && <span style={{ color: 'var(--orange)' }}> *</span>}
                </label>
                <input
                  className={`form-input${error ? ' form-input-error' : ''}`}
                  value={topic}
                  onChange={e => { setTopic(e.target.value); setError('') }}
                  placeholder={mode === 'crm'
                    ? 'e.g. shortening our negotiation stage'
                    : 'e.g. objection handling for mid-market SaaS renewals'}
                />
                {error && <div className="form-error">{error}</div>}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-sm btn-sm-ghost" onClick={onClose} disabled={generating}>Cancel</button>
                <button type="button" className="btn-sm btn-sm-primary" onClick={handleGenerate} disabled={generating}>
                  {generating ? 'Generating…' : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="sparkles" size={12} /> Generate
                    </span>
                  )}
                </button>
              </div>
            </>
          )}

          {draft && (
            <>
              {draft.demo && (
                <div style={{ fontSize: 11, color: 'var(--ink-l)', background: 'var(--cream-d)', borderRadius: 8, padding: '8px 10px', marginBottom: 14 }}>
                  Built from demo CRM data — connect HubSpot or Salesforce in Integrations for a playbook grounded in your real pipeline.
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: '0.01em' }}>{draft.input.title}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-l)', marginTop: 4 }}>{draft.input.category}</div>
                {draft.input.description && (
                  <div style={{ fontSize: 13, color: 'var(--ink-m)', marginTop: 8, lineHeight: 1.5 }}>{draft.input.description}</div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {draft.input.plays.map((p, i) => (
                  <div key={p.id} style={{ border: '1px solid var(--rule)', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{i + 1}. {p.title}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-m)', lineHeight: 1.5 }}>{p.description}</div>
                  </div>
                ))}
              </div>

              {draft.input.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {draft.input.tags.map(t => <span key={t} className="task-tag">{t}</span>)}
                </div>
              )}

              {draft.input.sourcesUsed && draft.input.sourcesUsed.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div className="form-label" style={{ marginBottom: 6 }}>Sources</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {draft.input.sourcesUsed.map(s => (
                      <a key={s.url} href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--orange)' }}>
                        {s.title || s.url}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="modal-footer">
                <button type="button" className="btn-sm btn-sm-ghost" onClick={() => setDraft(null)} disabled={generating}>
                  ← Regenerate
                </button>
                <button type="button" className="btn-sm btn-sm-primary" onClick={handleSave}>
                  Save Playbook
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
