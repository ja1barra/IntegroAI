import AgentPill from '../components/ui/AgentPill'

const PLAYBOOKS = [
  { num:'01', name:'Mid-Market ICP Outbound',     winRate:'74%', desc:'Fintech SaaS · 50–250 employees' },
  { num:'02', name:'Enterprise Champion Building', winRate:'68%', desc:'Multi-threaded · 6mo+ cycles' },
  { num:'03', name:'SMB Fast-Close',              winRate:'81%', desc:'Self-serve trial · <$20K ARR' },
  { num:'04', name:'Competitive Displacement',    winRate:'61%', desc:'Legacy CRM → Integro migration' },
  { num:'05', name:'Expansion Upsell',            winRate:'77%', desc:'CS-led · Seat + tier expansion' },
  { num:'06', name:'Re-Engagement',               winRate:'34%', desc:'Churned + cold accounts' },
  { num:'07', name:'Partner-Led Growth',          winRate:'88%', desc:'Agency + tech partner referral' },
  { num:'08', name:'Product-Led Conversion',      winRate:'52%', desc:'Trial → paid conversion triggers' },
]

export default function PlaybooksView({ active, addToast }: { active: boolean; addToast: (m: string) => void }) {
  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="view-header">
        <div><div className="view-subtitle">Strategy Library</div><h1 className="display view-title">Playbooks</h1></div>
        <div className="view-actions">
          <button className="btn-sm btn-sm-primary" onClick={() => addToast('Playbook builder — coming soon')}>+ New Playbook</button>
        </div>
      </div>
      <div className="grid-3">
        {PLAYBOOKS.map(pb => (
          <div key={pb.num} className="card" style={{ cursor:'pointer', transition:'transform 0.2s' }}
            onClick={() => addToast(`Opened: ${pb.name}`)}
            onMouseOver={e => (e.currentTarget as HTMLElement).style.transform='translateY(-2px)'}
            onMouseOut={e  => (e.currentTarget as HTMLElement).style.transform=''}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
              <span className="mono" style={{ fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--ink-l)' }}>Playbook {pb.num}</span>
              <AgentPill status="running" />
            </div>
            <div className="display" style={{ fontSize:22, lineHeight:1, marginBottom:8 }}>{pb.name}</div>
            <div style={{ fontSize:12, color:'var(--ink-l)', marginBottom:14 }}>{pb.desc}</div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid rgba(255,255,255,0.35)', paddingTop:10 }}>
              <span className="mono" style={{ fontSize:10, color:'var(--ink-l)' }}>Win rate</span>
              <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:'var(--orange)' }}>{pb.winRate}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
