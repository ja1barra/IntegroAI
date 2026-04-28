import { useState, useEffect } from 'react'

interface Props { score: number; size?: number }

export default function HealthRing({ score, size = 80 }: Props) {
  const r = (size / 2) - 7
  const circ = 2 * Math.PI * r
  const [offset, setOffset] = useState(circ)
  const color = score >= 75 ? '#3ecf8e' : score >= 50 ? '#f5a623' : '#e74c3c'

  useEffect(() => {
    const t = setTimeout(() => setOffset(circ - (score / 100) * circ), 120)
    return () => clearTimeout(t)
  }, [score, circ])

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--rule)" strokeWidth="5" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.4,0,0.2,1)' }} />
      </svg>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', lineHeight: 1 }}>
        <div className="health-ring-val">{score}</div>
        <div className="health-ring-unit">score</div>
      </div>
    </div>
  )
}
