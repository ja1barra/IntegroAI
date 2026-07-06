import React, { useState } from 'react'
import { Icon } from '../../components/ui/Icon'
import type { StepType, SequenceStep, Sequence } from '../../lib/outbound/types'

export type { StepType, SequenceStep, Sequence }

interface Props {
  onSave: (seq: Sequence) => void
  onCancel: () => void
  initial?: Sequence
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

export default function SequenceBuilder({ onSave, onCancel, initial }: Props) {
  const [name,  setName]  = useState(initial?.name  ?? '')
  const [steps, setSteps] = useState<SequenceStep[]>(initial?.steps ?? [makeStep(true)])

  const addStep    = () => setSteps(p => [...p, makeStep(false)])
  const removeStep = (id: string) => setSteps(p => p.filter(s => s.id !== id))
  const patchStep  = (id: string, patch: Partial<SequenceStep>) =>
    setSteps(p => p.map(s => s.id === id ? { ...s, ...patch } : s))

  const canSave = name.trim().length > 0 && steps.every(s => s.body.trim().length > 0)

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
        <label className="form-label">Sequence Name</label>
        <input
          className="form-input seq-name-input"
          placeholder="e.g. Cold Outreach — SaaS Founders"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />
      </div>

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
