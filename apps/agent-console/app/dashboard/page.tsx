import Link from 'next/link'
import { getServiceClient } from '@/lib/supabase'
import { StatusBadge } from '@/components/StatusBadge'
import { RunAgentButton } from '@/components/RunAgentButton'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const db = getServiceClient()

  const [
    { count: totalRuns },
    { count: totalEmails },
    { count: pendingCount },
    { count: approvedCount },
    { data: emails },
    { data: lastRun },
  ] = await Promise.all([
    db.from('agent_runs').select('*', { count: 'exact', head: true }),
    db.from('outbound_emails').select('*', { count: 'exact', head: true }),
    db.from('outbound_emails').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    db.from('outbound_emails').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    db.from('outbound_emails')
      .select('id, first_name, last_name, company, title, status, created_at')
      .order('created_at', { ascending: false })
      .limit(25),
    db.from('agent_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const stats = [
    { label: 'Total Runs',       value: totalRuns    ?? 0 },
    { label: 'Emails Generated', value: totalEmails  ?? 0 },
    { label: 'Pending Approval', value: pendingCount ?? 0 },
    { label: 'Approved',         value: approvedCount ?? 0 },
  ]

  const runDot =
    lastRun?.status === 'running'   ? 'bg-accent animate-pulse' :
    lastRun?.status === 'completed' ? 'bg-green-400' :
    lastRun?.status === 'failed'    ? 'bg-danger' :
    'bg-white/20'

  return (
    <div className="min-h-screen bg-ink">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-ink/95 backdrop-blur px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-bebas text-3xl tracking-widest text-cream leading-none">INTEGRO AI</span>
          <span className="font-mono text-[10px] text-muted border border-white/15 px-2 py-0.5 rounded tracking-widest uppercase">
            Agent Console
          </span>
        </div>
        <span className="font-mono text-xs text-muted hidden sm:block">
          {new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
        </span>
      </header>

      <main className="px-6 py-8 max-w-7xl mx-auto space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map(s => (
            <div key={s.label} className="bg-ink-l border border-white/10 rounded-lg px-5 py-4">
              <div className="text-[10px] font-mono text-muted uppercase tracking-widest mb-2">{s.label}</div>
              <div className="font-bebas text-4xl text-cream leading-none">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Body grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Agent Card */}
          <div className="bg-ink-l border border-white/10 rounded-lg p-6 flex flex-col gap-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Agent</div>
                <div className="font-bebas text-2xl text-cream leading-tight">Agent 01<br />Outbound</div>
              </div>
              <div className={`w-2.5 h-2.5 mt-1 rounded-full flex-shrink-0 ${runDot}`} />
            </div>

            <div className="space-y-3 text-sm flex-1">
              <div>
                <div className="text-[10px] font-mono text-muted uppercase tracking-widest mb-0.5">Last Run</div>
                <div className="text-cream">
                  {lastRun
                    ? new Date(lastRun.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                    : '—'}
                </div>
              </div>
              {lastRun && (
                <div>
                  <div className="text-[10px] font-mono text-muted uppercase tracking-widest mb-0.5">Result</div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={lastRun.status} />
                    <span className="text-xs text-muted">{lastRun.prospects_count} prospects</span>
                  </div>
                </div>
              )}
            </div>

            <RunAgentButton />
          </div>

          {/* Emails Table */}
          <div className="lg:col-span-2 bg-ink-l border border-white/10 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <span className="text-[10px] font-mono text-muted uppercase tracking-widest">Recent Emails</span>
              <span className="text-[10px] font-mono text-muted">{emails?.length ?? 0} records</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    {['Name', 'Company', 'Title', 'Status', ''].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-[10px] font-mono text-muted uppercase tracking-widest whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {!emails?.length ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-sm text-muted">
                        No emails generated yet. Run the agent to get started.
                      </td>
                    </tr>
                  ) : emails.map(row => (
                    <tr key={row.id} className="border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors">
                      <td className="px-5 py-3.5 text-sm text-cream whitespace-nowrap">
                        {row.first_name} {row.last_name}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-muted whitespace-nowrap">{row.company}</td>
                      <td className="px-5 py-3.5 text-sm text-muted max-w-[160px] truncate">{row.title}</td>
                      <td className="px-5 py-3.5 whitespace-nowrap"><StatusBadge status={row.status} /></td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {row.status === 'pending' && (
                          <Link
                            href={`/dashboard/review/${row.id}`}
                            className="text-xs font-mono text-accent hover:text-accent/70 transition-colors"
                          >
                            Review →
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
