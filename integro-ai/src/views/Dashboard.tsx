import { useState, useEffect } from 'react'
import StatCard from '../components/ui/StatCard'
import AgentPill from '../components/ui/AgentPill'
import EmptyState from '../components/ui/EmptyState'
import { Icon } from '../components/ui/Icon'
import { getDashboardSummary, type DashboardSummary } from '../lib/outbound/store'
import type { SharedViewProps } from '../types'

const RUN_LABEL: Record<string, string> = {
  generate: 'Generated AI drafts',
  send: 'Sent outbound emails',
  sync: 'Synced prospects from CRM',
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function Dashboard({ active, onNavigate, agentStates, addToast, onNewTask }: SharedViewProps & { onNavigate: (v: string) => void; onNewTask: () => void }) {
  const [sum, setSum] = useState<DashboardSummary | null>(null)

  useEffect(() => {
    let alive = true
    getDashboardSummary().then(s => { if (alive) setSum(s) }).catch(() => {})
    return () => { alive = false }
  }, [active])

  const agentCards = [
    { id:'outbound',       num:'01', name:'Outbound Sales Machine',   desc:'Prospecting, sequencing, and meeting booking — fully automated.', metric: sum ? `${sum.sent}` : '--', metricLabel: 'emails sent', live: true },
    { id:'demand',         num:'02', name:'Demand Generation',         desc:'Inbound pipeline, content signals, and MQL routing.', metric: '--', metricLabel: 'coming soon', live: false },
    { id:'success',        num:'03', name:'Customer Success Engine',   desc:'Health monitoring, churn risk flagging, and expansion tracking.', metric: '--', metricLabel: 'coming soon', live: false },
    { id:'playbook-agent', num:'04', name:'SaaS Growth Playbooks',     desc:'Win/loss analysis, coaching signals, and playbook generation.', metric: '--', metricLabel: 'coming soon', live: false },
  ]

  const runs = sum?.recentRuns ?? []

  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="view-header">
        <div>
          <h1 className="display view-title">Revenue OS</h1>
        </div>
        <div className="view-actions">
          <button className="btn-sm btn-sm-ghost" onClick={() => addToast('No data to export yet')}>Export Report</button>
          <button className="btn-sm btn-sm-primary" onClick={onNewTask}>+ New Task</button>
        </div>
      </div>

      <div className="stats-row">
        <StatCard label="Prospects"        value={String(sum?.prospects ?? 0)} active={active} />
        <StatCard label="Sequences Active" value={String(sum?.activeSequences ?? 0)} active={active} />
        <StatCard label="Emails Sent"      value={String(sum?.sent ?? 0)} active={active} />
        <StatCard label="Meetings Booked"  value={String(sum?.meetings ?? 0)} active={active} />
      </div>

      <div className="agent-cards-grid">
        {agentCards.map(a => (
          <div key={a.id} className={`agent-status-card ${a.live && agentStates[a.id as keyof typeof agentStates] === 'running' ? 'running' : ''}`} onClick={() => a.live && onNavigate(a.id)} style={{ cursor: a.live ? 'pointer' : 'default', opacity: a.live ? 1 : 0.72 }}>
            <div className="agent-card-top">
              <span className="agent-card-num">Agent {a.num}</span>
              {a.live ? <AgentPill status={agentStates[a.id as keyof typeof agentStates]} /> : <span className="pstatus pstatus-new">Soon</span>}
            </div>
            <div className="agent-card-name">{a.name}</div>
            <div className="agent-card-desc">{a.desc}</div>
            <div className="agent-card-metrics">
              <div className="agent-metric">
                <div className="agent-metric-val">{a.metric}</div>
                <div className="agent-metric-label">{a.metricLabel}</div>
              </div>
            </div>
            <div className="agent-card-footer">
              <span className="agent-last-run">{a.live ? 'Open to manage' : 'In development'}</span>
              {a.live && (
                <span className="agent-open-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  Open <Icon name="arrowRight" size={11} />
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="grid-2-1" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Live Activity</div>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background: runs.length ? '#3ecf8e' : 'var(--ink-l)' }} />
              <span className="mono" style={{ fontSize:9, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--ink-l)' }}>{runs.length ? 'Active' : 'Idle'}</span>
            </div>
          </div>
          {runs.length === 0 ? (
            <EmptyState
              icon="bolt"
              title="No activity yet"
              desc="Agent actions appear here once you sync prospects and start generating outreach."
              action={{ label: 'Open Outbound', onClick: () => onNavigate('outbound') }}
            />
          ) : (
            <div className="activity-list">
              {runs.map(r => (
                <div key={r.id} className="activity-item">
                  <div className={`activity-dot ${r.status === 'failed' ? 'activity-dot-fail' : ''}`} />
                  <div style={{ flex: 1 }}>
                    <div className="activity-text">{RUN_LABEL[r.kind] ?? r.kind}{r.itemCount ? ` — ${r.itemCount}` : ''}</div>
                    <div className="activity-time">{timeAgo(r.createdAt)}{r.status === 'failed' ? ' · failed' : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Needs Approval</div>
          </div>
          {sum && sum.drafts > 0 ? (
            <div style={{ textAlign:'center', padding:'28px 16px' }}>
              <div className="stat-value" style={{ fontSize: 40 }}>{sum.drafts}</div>
              <div style={{ fontSize:12, color:'var(--ink-l)', margin:'4px 0 14px' }}>AI draft{sum.drafts === 1 ? '' : 's'} awaiting review</div>
              <button className="btn-sm btn-sm-primary" onClick={() => onNavigate('outbound')}>Review drafts</button>
            </div>
          ) : (
            <div style={{ textAlign:'center', padding:'28px 16px', color:'var(--ink-l)' }}>
              <div style={{ display:'flex', justifyContent:'center', marginBottom:4, color:'#3ecf8e' }}>
                <Icon name="checkCircle" size={36} />
              </div>
              <div style={{ fontSize:13 }}>Nothing pending</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
