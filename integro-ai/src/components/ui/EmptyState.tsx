interface Props {
  icon?: string
  title: string
  desc: string
  action?: { label: string; onClick: () => void }
}

export default function EmptyState({ icon = '🔌', title, desc, action }: Props) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '48px 24px', textAlign: 'center', gap: 12,
    }}>
      <div style={{ fontSize: 36, opacity: 0.35 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--ink-l)', maxWidth: 280, lineHeight: 1.55 }}>{desc}</div>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: 8, padding: '8px 20px',
            background: 'var(--orange)', color: '#fff',
            border: 'none', borderRadius: 'var(--radius-pill)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
