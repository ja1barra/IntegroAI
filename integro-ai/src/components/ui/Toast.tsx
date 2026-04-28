import type { Toast } from '../../types'

export default function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 1000, pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === 'error' ? '#c0392b' : 'var(--ink)',
          color: 'var(--cream)', padding: '10px 16px', borderRadius: 'var(--radius-pill)',
          fontFamily: "'DM Mono',monospace", fontSize: 11, letterSpacing: '0.04em',
          boxShadow: '0 4px 20px rgba(26,23,20,0.25)', animation: 'fadeUp 0.3s ease',
        }}>{t.msg}</div>
      ))}
    </div>
  )
}
