interface Props { data: number[]; animate: boolean }

export default function SparkBars({ data, animate }: Props) {
  const max = Math.max(...data)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40, marginBottom: 8 }}>
      {data.map((v, i) => (
        <div key={i} style={{
          flex: 1, background: 'var(--orange)',
          opacity: i === data.length - 1 ? 1 : 0.15 + 0.12 * i,
          borderRadius: 1,
          height: animate ? `${(v / max) * 100}%` : '0%',
          transition: `height 0.8s cubic-bezier(0.4,0,0.2,1) ${i * 0.06}s`,
        }} />
      ))}
    </div>
  )
}
