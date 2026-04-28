import type { AgentStatus } from '../../types'

interface Props { status: AgentStatus }

const map: Record<AgentStatus, [string, string]> = {
  running: ['pill-running', '● Running'],
  paused:  ['pill-paused',  '⏸ Paused'],
  idle:    ['pill-idle',    '○ Idle'],
}

export default function AgentPill({ status }: Props) {
  const [cls, label] = map[status] ?? map.idle
  return <span className={`agent-pill ${cls}`}>{label}</span>
}
