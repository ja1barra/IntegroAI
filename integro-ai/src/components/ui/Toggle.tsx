export default function Toggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      role="switch"
      aria-checked={enabled}
      style={{
        width: 38, height: 22, borderRadius: 11, cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
        background: enabled ? 'var(--orange)' : 'rgba(115,115,115,0.2)',
        border: `1px solid ${enabled ? 'rgba(212,80,26,0.4)' : 'rgba(115,115,115,0.25)'}`,
        position: 'relative',
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: enabled ? 18 : 2, width: 16, height: 16,
        borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
        transition: 'left 0.2s',
      }} />
    </div>
  )
}
