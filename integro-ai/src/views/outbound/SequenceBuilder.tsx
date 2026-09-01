import React, { useState } from 'react'
import { Icon } from '../../components/ui/Icon'
import { generateSequenceTemplate, type Sender } from '../../lib/outbound/generate'
import type { StepType, SequenceStep, Sequence } from '../../lib/outbound/types'

export type { StepType, SequenceStep, Sequence }

interface Props {
  onSave: (seq: Sequence) => void
  onCancel: () => void
  initial?: Sequence
  sender: Sender
}

const TYPES: { v: StepType; label: string }[] = [
  { v: 'email',    label: 'Email'    },
  { v: 'linkedin', label: 'LinkedIn' },
  { v: 'call',     label: 'Call'     },
]

const uid = () => Math.random().toString(36).slice(2)

function makeStep(isFirst: boolean): SequenceStep {
  return { id: uid(), type: 'email', delay: isFirst ? 1 : 3, subject: '', body: '' }
}

function absDay(steps: SequenceStep[], idx: number): number {
  return steps.slice(0, idx + 1).reduce((sum, s) => sum + s.delay, 0)
}

export default function SequenceBuilder({ onSave, onCancel, initial, sender }: Props) {
  const [name,  setName]  = useState(initial?.name  ?? '')
  const [steps, setSteps] = useState<SequenceStep[]>(initial?.steps ?? [makeStep(true)])

  const addStep    = () => setSteps(p => [...p, makeStep(false)])
  const removeStep = (id: string) => setSteps(p => p.filter(s => s.id !== id))
  const patchStep  = (id: string, patch: Partial<SequenceStep>) =>
    setSteps(p => p.map(s => s.id === id ? { ...s, ...patch } : s))

  const canSave = name.trim().length > 0 && steps.every(s => s.body.trim().length > 0)

  // ── AI generation ────────────────────────────
  const [aiOpen,  setAiOpen]  = useState(false)
  const [brief,   setBrief]   = useState('')
  const [count,   setCount]   = useState(3)
  const [aiBusy,  setAiBusy]  = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const hasContent = steps.some(s => s.subject.trim() || s.body.trim())

  async function handleGenerate() {
    if (!brief.trim() || aiBusy) return
    setAiBusy(true)
    setAiError(null)
    const res = await generateSequenceTemplate(brief.trim(), count, sender)
    setAiBusy(false)
    if (!res.ok || !res.steps) {
      setAiError(res.error ?? 'Generation failed')
      return
    }
    setSteps(res.steps.map(s => ({ id: uid(), type: s.type, delay: s.delay, subject: s.subject, body: s.body })))
    if (!name.trim()) setName(brief.trim().slice(0, 60))
    setAiOpen(false)
    setBrief('')
  }

  function handleSave() {
    if (!canSave) return
    onSave({
      id:        initial?.id ?? uid(),
      name:      name.trim(),
      steps,
      status:    initial?.status ?? 'draft',
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    })
  }

  return (
    <div className="seq-builder fade-in">

      {/* ── Name ────────────────────────────────── */}
      <div className="seq-builder-name">
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="form-label">Sequence Name</label>
            <input
              className="form-input seq-name-input"
              placeholder="e.g. Cold Outreach — SaaS Founders"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>
          {!aiOpen && (
            <button className="seq-ai-trigger" onClick={() => setAiOpen(true)}>
              <Icon name="sparkles" size={12} /> Generate with AI
            </button>
          )}
        </div>
      </div>

      {/* ── AI generation panel ──────────────────── */}
      {aiOpen && (
        <div className="seq-ai-panel">
          <div className="seq-ai-panel-header">
            <Icon name="sparkles" size={13} />
            <span>Draft this sequence with AI</span>
            <button className="seq-ai-panel-close" onClick={() => { setAiOpen(false); setAiError(null) }}>
              <Icon name="close" size={10} />
            </button>
          </div>

          <div className="seq-field">
            <label className="form-label">Who are you targeting, and what's the angle?</label>
            <textarea
              className="seq-body-input"
              rows={3}
              placeholder="e.g. VP Sales / RevOps leaders at 50-200 person B2B SaaS companies who are hiring SDRs but missing pipeline targets. Angle: we build outbound systems that book meetings without headcount."
              value={brief}
              onChange={e => setBrief(e.target.value)}
              autoFocus
            />
          </div>

          <div className="seq-ai-panel-row">
            <label className="form-label" style={{ margin: 0 }}>Steps</label>
            <div className="seq-ai-count">
              <button type="button" onClick={() => setCount(c => Math.max(2, c - 1))} disabled={count <= 2}>–</button>
              <span>{count}</span>
              <button type="button" onClick={() => setCount(c => Math.min(6, c + 1))} disabled={count >= 6}>+</button>
            </div>
            <span className="seq-ai-hint">All email · escalating touches, days apart</span>
          </div>

          {hasContent && (
            <div className="seq-ai-warning">
              <Icon name="warning" size={11} /> This will replace your {steps.length} current step{steps.length === 1 ? '' : 's'}.
            </div>
          )}

          {aiError && (
            <div className="seq-ai-warning seq-ai-warning-error">
              <Icon name="error" size={11} /> {aiError}
            </div>
          )}

          <div className="seq-ai-panel-footer">
            <button className="btn-sm btn-sm-ghost" onClick={() => { setAiOpen(false); setAiError(null) }}>Cancel</button>
            <button className="btn-sm btn-sm-primary" onClick={handleGenerate} disabled={!brief.trim() || aiBusy}>
              {aiBusy ? <span className="btn-loading"><span />Drafting…</span> : <>
                <Icon name="sparkles" size={11} /> Generate {count} steps
              </>}
            </button>
          </div>
        </div>
      )}

      {/* ── Steps ───────────────────────────────── */}
      <div className="seq-steps">
        {steps.map((step, i) => (
          <React.Fragment key={step.id}>

            <div className="seq-step-card">

              {/* Step header */}
              <div className="seq-step-header">
                <span className="seq-step-num">Step {i + 1}</span>
                <span className="seq-step-day">Day {absDay(steps, i)}</span>

                <div className="seq-type-pills">
                  {TYPES.map(t => (
                    <button
                      key={t.v}
                      className={`seq-type-pill${step.type === t.v ? ' active' : ''}`}
                      onClick={() => patchStep(step.id, { type: t.v })}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {steps.length > 1 && (
                  <button className="seq-step-remove" title="Remove step" onClick={() => removeStep(step.id)}>
                    <Icon name="close" size={10} />
                  </button>
                )}
              </div>

              {/* Subject — email only */}
              {step.type === 'email' && (
                <div className="seq-field">
                  <label className="form-label">Subject</label>
                  <input
                    className="form-input"
                    placeholder="Subject line..."
                    value={step.subject}
                    onChange={e => patchStep(step.id, { subject: e.target.value })}
                  />
                </div>
              )}

              {/* Body */}
              <div className="seq-field">
                <label className="form-label">
                  {step.type === 'email' ? 'Body' : step.type === 'linkedin' ? 'Message' : 'Script'}
                </label>
                <textarea
                  className="seq-body-input"
                  rows={5}
                  placeholder={
                    step.type === 'email'    ? 'Write your email body...' :
                    step.type === 'linkedin' ? 'Write your LinkedIn message...' :
                                               'Call talking points / script...'
                  }
                  value={step.body}
                  onChange={e => patchStep(step.id, { body: e.target.value })}
                />
              </div>
            </div>

            {/* Connector with editable delay */}
            {i < steps.length - 1 && (
              <div className="seq-connector">
                <div className="seq-connector-line" />
                <div className="seq-connector-badge">
                  <span className="seq-connector-plus">+</span>
                  <input
                    type="number"
                    min={1}
                    className="seq-delay-edit"
                    value={steps[i + 1].delay}
                    onChange={e => {
                      const v = parseInt(e.target.value, 10)
                      if (v >= 1) patchStep(steps[i + 1].id, { delay: v })
                    }}
                  />
                  <span>{steps[i + 1].delay === 1 ? 'day' : 'days'}</span>
                </div>
                <div className="seq-connector-line" />
              </div>
            )}

          </React.Fragment>
        ))}
      </div>

      <button className="seq-add-step" onClick={addStep}>
        <Icon name="plus" size={11} />
        Add Step
      </button>

      {/* ── Footer ──────────────────────────────── */}
      <div className="seq-builder-footer">
        <button className="control-btn" onClick={onCancel}>Cancel</button>
        <button
          className="btn-sm btn-sm-primary"
          disabled={!canSave}
          onClick={handleSave}
        >
          {initial ? 'Update Sequence' : 'Save Sequence'}
        </button>
      </div>

    </div>
  )
}
