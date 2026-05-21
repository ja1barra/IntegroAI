import { Icon } from '../components/ui/Icon'
import type { IconName } from '../components/ui/Icon'

interface Props { active: boolean }

const COURSES: { title: string; desc: string; lessons: number; badge: IconName }[] = [
  { title: 'Outbound Mastery', desc: 'Build high-converting outbound sequences with AI assistance', lessons: 8, badge: 'bolt' },
  { title: 'Demand Generation Playbook', desc: 'Turn MQLs into pipeline with automated nurture flows', lessons: 6, badge: 'demandGen' },
  { title: 'Customer Success at Scale', desc: 'Predict churn and expand accounts using health signals', lessons: 7, badge: 'customerSuccess' },
  { title: 'AI-Powered Growth', desc: 'Leverage IntegroAI agents to run full-funnel GTM motions', lessons: 10, badge: 'agents' },
]

export default function AcademyView({ active }: Props) {
  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="view-header">
        <div>
          <div className="view-title">Academy</div>
          <div style={{ color: 'var(--ink-l)', fontSize: 14, marginTop: 4 }}>Learn to get the most from your AI agents</div>
        </div>
        <div style={{ padding: '6px 14px', background: 'rgba(212,80,26,0.1)', borderRadius: 'var(--radius-pill)', fontSize: 12, fontFamily: "'DM Mono',monospace", color: 'var(--orange)', letterSpacing: '0.05em' }}>COMING SOON</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
        {COURSES.map(c => (
          <div key={c.title} style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 'var(--radius)', border: '1px solid rgba(255,255,255,0.7)', padding: '20px 22px', backdropFilter: 'blur(12px)', opacity: 0.72, cursor: 'not-allowed' }}>
            <div style={{ marginBottom: 12 }}><Icon name={c.badge} size={28} /></div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{c.title}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-l)', lineHeight: 1.5, marginBottom: 14 }}>{c.desc}</div>
            <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-l)' }}>{c.lessons} lessons</div>
          </div>
        ))}
      </div>
    </div>
  )
}
