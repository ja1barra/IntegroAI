import type { DeltaType } from '../../types'
import { useCountUp } from '../../hooks/useCountUp'

interface Props {
  label: string
  value: string
  unit?: string
  prefix?: string
  delta?: string
  deltaType?: DeltaType
  active: boolean
  spark?: number[]
}

export default function StatCard({ label, value, unit, prefix, delta, deltaType = 'delta-flat', active, spark }: Props) {
  const raw = value.replace(/[^0-9.]/g, '')
  const num = parseFloat(raw) || 0
  const isFloat = raw.includes('.')
  const counted = useCountUp(Math.round(num * (isFloat ? 10 : 1)), active)
  const display = isFloat ? (counted / 10).toFixed(1) : counted
  const bars = spark ?? [3, 4, 3.5, 5, 5.5, 6.5, 8]
  const maxBar = Math.max(...bars)
  const accentColor = deltaType === 'delta-down' ? '#e74c3c' : deltaType === 'delta-flat' ? 'var(--ink-l)' : 'var(--orange)'

  return (
    <div className="stat-card" style={{ padding: '22px 22px 20px', position: 'relative', overflow: 'hidden' }}>
      <div className="stat-label" style={{ marginBottom: 14 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div className="stat-value" style={{ fontSize: 'clamp(38px,3.8vw,54px)', lineHeight: 1 }}>
          {prefix && <span className="stat-unit" style={{ fontSize: '0.52em' }}>{prefix}</span>}
          {display}
          {unit && <span className="stat-unit" style={{ fontSize: '0.48em' }}>{unit}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 44, flexShrink: 0, paddingBottom: 2 }}>
          {bars.map((v, i) => (
            <div key={i} style={{
              width: 5, borderRadius: 2,
              background: accentColor,
              opacity: i === bars.length - 1 ? 1 : 0.12 + 0.11 * i,
              height: active ? `${(v / maxBar) * 100}%` : '0%',
              transition: `height 0.8s cubic-bezier(0.4,0,0.2,1) ${i * 0.06}s`,
            }} />
          ))}
        </div>
      </div>
      {delta && <div className={`stat-delta ${deltaType}`} style={{ marginTop: 12 }}>{delta}</div>}
      <div style={{
        position: 'absolute', bottom: 0, left: 0,
        height: 2, background: accentColor,
        width: active ? '100%' : '0%',
        transition: 'width 1.4s ease 0.2s',
        opacity: 0.6,
      }} />
    </div>
  )
}
