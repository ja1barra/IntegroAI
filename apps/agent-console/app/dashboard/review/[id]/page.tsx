import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getServiceClient } from '@/lib/supabase'
import { StatusBadge } from '@/components/StatusBadge'
import { ReviewActions } from '@/components/ReviewActions'

export const dynamic = 'force-dynamic'

export default async function ReviewPage({ params }: { params: { id: string } }) {
  const db = getServiceClient()

  const { data: email } = await db
    .from('outbound_emails')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (!email) notFound()

  return (
    <div className="min-h-screen bg-ink">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-ink/95 backdrop-blur px-8 py-4 flex items-center gap-4">
        <span className="font-bebas text-3xl tracking-widest text-cream leading-none">INTEGRO AI</span>
        <span className="font-mono text-[10px] text-muted border border-white/15 px-2 py-0.5 rounded tracking-widest uppercase">
          Agent Console
        </span>
      </header>

      <main className="px-6 py-8 max-w-5xl mx-auto">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-muted hover:text-cream transition-colors mb-8"
        >
          ← Back to Dashboard
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Prospect info */}
          <div className="bg-ink-l border border-white/10 rounded-lg p-6">
            <div className="text-[10px] font-mono text-muted uppercase tracking-widest mb-5">Prospect</div>
            <div className="space-y-4">
              {[
                { label: 'Name',    value: `${email.first_name} ${email.last_name}` },
                { label: 'Title',   value: email.title },
                { label: 'Company', value: email.company },
                { label: 'Email',   value: email.email, mono: true },
              ].map(f => (
                <div key={f.label}>
                  <div className="text-[10px] font-mono text-muted uppercase tracking-widest mb-0.5">{f.label}</div>
                  <div className={`text-sm text-cream break-all ${f.mono ? 'font-mono' : ''}`}>{f.value || '—'}</div>
                </div>
              ))}
              <div>
                <div className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Status</div>
                <StatusBadge status={email.status} />
              </div>
              {email.approved_at && (
                <div className="text-[10px] font-mono text-muted">
                  Approved {new Date(email.approved_at).toLocaleString()}
                </div>
              )}
              {email.rejected_at && (
                <div className="text-[10px] font-mono text-muted">
                  Rejected {new Date(email.rejected_at).toLocaleString()}
                </div>
              )}
            </div>
          </div>

          {/* Email body + actions */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-ink-l border border-white/10 rounded-lg p-6">
              <div className="text-[10px] font-mono text-muted uppercase tracking-widest mb-5">Generated Email</div>
              <div className="text-sm text-cream/90 leading-relaxed whitespace-pre-wrap font-dm">
                {email.generated_email || 'No email content available.'}
              </div>
            </div>

            {email.status === 'pending' ? (
              <ReviewActions id={email.id} />
            ) : (
              <p className="text-xs font-mono text-muted text-center py-2">
                This email has already been <span className="text-cream">{email.status}</span>.
              </p>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}
