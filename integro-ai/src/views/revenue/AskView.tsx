import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../../lib/revenue/api'
import { useApi } from '../../lib/revenue/useApi'
import { t } from '../../lib/revenue/i18n'
import { formatDate } from '../../lib/revenue/format'
import type { AskResponse, ChatMessage, Source } from '../../lib/revenue/types'
import { StateBox, ErrorBox } from '../../components/revenue/common'
import { SourceChips } from './BriefView'
import type { RevenueViewProps } from './OverviewView'

interface Turn { role: 'user' | 'assistant'; text: string; sources?: Source[]; limitations?: string[]; asOf?: string | null; insufficient?: boolean; verified?: boolean; error?: string }

export default function AskView({ active, onOpenDeal, onNavigate }: RevenueViewProps) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [session, setSession] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [fatal, setFatal] = useState<ApiError | null>(null)
  const sessions = useApi<{ items: { id: string; title: string | null; created_at: string }[] }>('revenue/chat/sessions', {}, active)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [turns, busy])

  const ask = async (q: string) => {
    const question = q.trim()
    if (!question || busy) return
    setInput(''); setBusy(true); setFatal(null)
    setTurns(x => [...x, { role: 'user', text: question }])
    try {
      const r = await api<AskResponse>('revenue/ask', { method: 'POST', body: { question, session_id: session ?? undefined } })
      setSession(r.session_id)
      setTurns(x => [...x, { role: 'assistant', text: r.answer, sources: r.sources, limitations: r.limitations, asOf: r.data_as_of, insufficient: r.insufficient_data, verified: r.verified }])
      sessions.reload()
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, 'error', 'Failed')
      if (err.code === 'ai_unavailable') setTurns(x => [...x, { role: 'assistant', text: `${t('ask.ai_unavailable')} ${err.reason ? t(`ask.reason.${err.reason}`) : ''}`.trim(), error: err.requestId }])
      else if (err.status === 403 && err.code === 'feature_disabled') setFatal(err)
      else setTurns(x => [...x, { role: 'assistant', text: err.message, error: err.requestId }])
    } finally { setBusy(false) }
  }

  const load = async (id: string) => {
    try {
      const r = await api<{ messages: ChatMessage[] }>(`revenue/chat/sessions/${id}`)
      setSession(id); setTurns(r.messages.map(m => ({ role: m.role, text: m.content, sources: m.evidence_refs, asOf: m.data_as_of })))
    } catch { /* ignore */ }
  }

  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="view-header"><div><div className="view-subtitle">{t('group.revenue')}</div><h1 className="display view-title">{t('ask.title')}</h1></div>
        <div className="view-actions"><button className="btn-sm btn-sm-ghost" onClick={() => { setSession(null); setTurns([]) }}>New chat</button></div></div>
      {fatal && <ErrorBox error={fatal} />}
      <div className="rv-split">
        <nav className="card rv-briefs-list" aria-label="Your private chats">
          <div className="rv-muted" style={{ padding: '4px 8px' }}>Private to you</div>
          {(sessions.data?.items ?? []).map(s => <button key={s.id} className={`rv-brief-item ${session === s.id ? 'is-selected' : ''}`} onClick={() => void load(s.id)}>{s.title ?? formatDate(s.created_at)}</button>)}
        </nav>
        <section className="card rv-chat" aria-label="Conversation">
          <div className="rv-chat-log" aria-live="polite">
            {turns.length === 0 && (
              <div>
                <StateBox icon="chat" title={t('ask.suggested')} desc="Answers use only your synced HubSpot data and cite their sources." />
                <div className="rv-suggest">{['ask.q1', 'ask.q2', 'ask.q3', 'ask.q4'].map(k => <button key={k} className="btn-sm btn-sm-ghost" onClick={() => void ask(t(k))}>{t(k)}</button>)}</div>
              </div>
            )}
            {turns.map((m, i) => (
              <div key={i} className={`rv-msg rv-msg-${m.role}`}>
                <div className="rv-msg-text">{m.text}</div>
                {m.role === 'assistant' && m.insufficient && <div className="rv-note">{t('ask.insufficient')}</div>}
                {m.verified === false && <div className="rv-note">{t('ask.unverified')}</div>}
                {m.sources && m.sources.length > 0 && <div className="rv-msg-sources"><span className="rv-muted">{t('brief.sources')}: </span><SourceChips sources={m.sources} ids={m.sources.map(s => s.id)} onOpenDeal={onOpenDeal} /></div>}
                {m.asOf && <div className="rv-muted">{t('common.data_as_of')} {formatDate(m.asOf, undefined, true)}</div>}
                {m.limitations && m.limitations.length > 0 && <div className="rv-muted">{t('ask.limitations')}: {m.limitations.join(' ')}</div>}
                {m.error && <div className="rv-muted">{t('common.request_ref')}: {m.error}</div>}
              </div>
            ))}
            {busy && <div className="rv-msg rv-msg-assistant rv-muted" role="status">{t('common.loading')}</div>}
            <div ref={end} />
          </div>
          <form className="rv-chat-form" onSubmit={e => { e.preventDefault(); void ask(input) }}>
            <label className="rv-sr" htmlFor="ask-input">{t('ask.placeholder')}</label>
            <input id="ask-input" className="form-input" value={input} maxLength={1000} placeholder={t('ask.placeholder')} onChange={e => setInput(e.target.value)} />
            <button className="btn-sm btn-sm-primary" type="submit" disabled={busy || !input.trim()}>{t('ask.send')}</button>
          </form>
          <div className="rv-note">Integro may propose tasks; they appear under <button className="rv-link" onClick={() => onNavigate('rv-actions')}>{t('nav.actions')}</button> and nothing runs until a manager approves.</div>
        </section>
      </div>
    </div>
  )
}
