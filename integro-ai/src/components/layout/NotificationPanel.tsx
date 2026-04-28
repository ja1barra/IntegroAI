export default function NotificationPanel() {
  const notifs = [
    { color: '#3ecf8e', title: 'Meeting booked',    desc: 'Sarah Chen, VP Sales at Synapse.io',       time: '4 min ago',  unread: true },
    { color: '#e74c3c', title: 'Churn risk alert',  desc: 'Orbit Analytics — usage down 42%',         time: '1 hr ago',   unread: true },
    { color: '#f5a623', title: 'Approval needed',   desc: 'Sequence #7 ready — 45 fintech CTOs',      time: '2 hrs ago',  unread: true },
    { color: '#4d9de0', title: 'MQL routed',         desc: 'Alex Fontaine (score 94) → Outbound',     time: '3 hrs ago',  unread: false },
    { color: '#9b59b6', title: 'New win pattern',    desc: '3 traits shared by fast-close deals',     time: '5 hrs ago',  unread: false },
  ]
  return (
    <div style={{ position: 'absolute', top: 48, right: 0, width: 320, background: 'var(--glass)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--glass-shadow)', zIndex: 200, animation: 'fadeUp 0.2s ease', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.35)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>Notifications</div>
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: 'var(--orange)', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Mark All Read</span>
      </div>
      {notifs.map((n, i) => (
        <div key={i} style={{ padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,0.25)', display: 'flex', gap: 10, cursor: 'pointer', background: n.unread ? 'rgba(212,80,26,0.025)' : 'transparent' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: n.color, marginTop: 4, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: n.unread ? 500 : 400 }}>{n.title}</span>
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: 'var(--ink-l)', flexShrink: 0 }}>{n.time}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-l)', marginTop: 2 }}>{n.desc}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
