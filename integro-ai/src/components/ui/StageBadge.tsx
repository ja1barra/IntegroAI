import type { StageKey } from '../../types'

const map: Record<StageKey, [string, string]> = {
  prospect:  ['stage-prospect',  'In Sequence'],
  contacted: ['stage-contacted', 'Contacted'],
  replied:   ['stage-replied',   'Replied'],
  meeting:   ['stage-meeting',   'Meeting Set'],
  churning:  ['stage-churning',  'Churn Risk'],
  healthy:   ['stage-healthy',   'Healthy'],
  risk:      ['stage-risk',      'At Risk'],
  pending:   ['stage-contacted', 'Pending'],
}

export default function StageBadge({ stage }: { stage: StageKey }) {
  const [cls, label] = map[stage] ?? ['stage-prospect', 'Unknown']
  return <span className={`stage-badge ${cls}`}>{label}</span>
}
