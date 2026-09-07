import { useEffect, useState } from 'react'
import { Icon } from '../../components/ui/Icon'
import { AI_PROVIDERS, providerMeta } from '../../lib/ai/types'
import type { AIProviderKind, AIProviderSettings } from '../../lib/ai/types'
import { loadAIProviderSettings, saveAIProviderSettings, clearAIProviderSettings, testAIProviderSettings } from '../../lib/ai/providerStore'

const EMPTY_FORM: AIProviderSettings = { provider: 'anthropic', apiKey: '', baseUrl: '', model: '' }

interface Props {
  addToast: (m: string, t?: 'success' | 'error') => void
}

export default function AIProviderPanel({ addToast }: Props) {
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState<AIProviderSettings | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<AIProviderSettings>(EMPTY_FORM)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [savingState, setSavingState] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadAIProviderSettings().then(s => {
      if (cancelled) return
      setSaved(s)
      if (s) setForm(s)
      setLoading(false)
    }).catch(() => setLoading(false))
    return () => { cancelled = true }
  }, [])

  const meta = providerMeta(form.provider)

  const handleProviderChange = (id: AIProviderKind) => {
    setForm(f => ({ ...f, provider: id, baseUrl: id === 'custom' ? f.baseUrl : '', model: '' }))
    setTestResult(null)
  }

  const canSave = form.apiKey.trim().length > 0
    && (!meta.modelRequired || (form.model ?? '').trim().length > 0)
    && (!meta.baseUrlRequired || (form.baseUrl ?? '').trim().length > 0)

  const handleTest = async () => {
    if (!canSave) return
    setTesting(true)
    setTestResult(null)
    const result = await testAIProviderSettings(form)
    setTestResult(result)
    setTesting(false)
  }

  const handleSave = async () => {
    if (!canSave) return
    setSavingState(true)
    try {
      await saveAIProviderSettings(form)
      setSaved(form)
      setEditing(false)
      setTestResult(null)
      addToast(`${meta.label} connected — agents will now run on your account`)
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Failed to save AI provider', 'error')
    } finally {
      setSavingState(false)
    }
  }

  const handleRemove = async () => {
    try {
      await clearAIProviderSettings()
    } catch {
      // Non-fatal — fall through to reset local state either way
    }
    setSaved(null)
    setForm(EMPTY_FORM)
    setEditing(false)
    setTestResult(null)
    addToast("Removed — agents will use Integro's shared AI again")
  }

  if (loading) return null

  return (
    <div className="card" style={{ padding: '18px 20px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(212,80,26,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="sparkles" size={18} style={{ color: 'var(--orange)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>AI Provider</div>
              <div style={{ fontSize: 12, color: 'var(--ink-l)', marginTop: 2 }}>
                Bring your own AI — agents generate content on your account and your billing, not Integro's.
              </div>
            </div>
            {saved && !editing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn-sm btn-sm-ghost" onClick={() => { setEditing(true); setTestResult(null) }}>Change</button>
                <button className="btn-sm btn-sm-ghost" onClick={handleRemove} style={{ color: '#c0392b' }}>Remove</button>
              </div>
            )}
          </div>

          {/* Connected summary */}
          {saved && !editing && (
            <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: '#eaf5ee', border: '1px solid rgba(42,125,79,0.25)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="checkCircle" size={14} style={{ color: '#2a7d4f', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#2a7d4f' }}>
                Using <strong>{providerMeta(saved.provider).label}</strong>{saved.model ? ` — ${saved.model}` : ''}
              </span>
            </div>
          )}

          {/* Empty state / edit form */}
          {(!saved || editing) && (
            <div style={{ marginTop: 14 }}>
              {!saved && !editing && null}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
                {AI_PROVIDERS.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProviderChange(p.id)}
                    className="card"
                    style={{
                      padding: '10px 12px', textAlign: 'left', cursor: 'pointer',
                      border: form.provider === p.id ? '1.5px solid var(--orange)' : '1px solid rgba(255,255,255,0.7)',
                      background: form.provider === p.id ? 'rgba(212,80,26,0.06)' : 'rgba(255,255,255,0.5)',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</div>
                  </button>
                ))}
              </div>

              <div style={{ fontSize: 12, color: 'var(--ink-l)', lineHeight: 1.5, marginBottom: 14 }}>
                {meta.helpText}
                {meta.docsUrl && (
                  <>
                    {' '}
                    <a href={meta.docsUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--orange)' }}>{meta.docsLabel}</a>
                  </>
                )}
              </div>

              <div className="form-row-2" style={{ marginBottom: meta.baseUrlRequired ? 12 : 0 }}>
                <div className="form-group">
                  <label className="form-label">API Key</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder={meta.keyPlaceholder}
                    value={form.apiKey}
                    onChange={e => { setForm(f => ({ ...f, apiKey: e.target.value })); setTestResult(null) }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{meta.modelLabel}</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder={meta.modelPlaceholder}
                    value={form.model ?? ''}
                    onChange={e => { setForm(f => ({ ...f, model: e.target.value })); setTestResult(null) }}
                  />
                </div>
              </div>

              {meta.baseUrlRequired && (
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">Base URL</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder={meta.baseUrlPlaceholder}
                    value={form.baseUrl ?? ''}
                    onChange={e => { setForm(f => ({ ...f, baseUrl: e.target.value })); setTestResult(null) }}
                  />
                </div>
              )}

              {testResult && !testResult.ok && (
                <div style={{ fontSize: 11, color: '#c0392b', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="error" size={11} style={{ color: '#c0392b', flexShrink: 0 }} /> {testResult.error}
                </div>
              )}
              {testResult && testResult.ok && (
                <div style={{ fontSize: 11, color: '#2a7d4f', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="check" size={11} style={{ color: '#2a7d4f', flexShrink: 0 }} /> Connection verified
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn-sm btn-sm-ghost" onClick={handleTest} disabled={!canSave || testing}>
                  {testing ? <span className="btn-loading"><span />Testing...</span> : 'Test Connection'}
                </button>
                <button className="btn-sm btn-sm-primary" onClick={handleSave} disabled={!canSave || savingState}>
                  {savingState ? <span className="btn-loading"><span />Saving...</span> : 'Save'}
                </button>
                {editing && (
                  <button className="btn-sm btn-sm-ghost" onClick={() => { setEditing(false); setForm(saved ?? EMPTY_FORM); setTestResult(null) }}>Cancel</button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
