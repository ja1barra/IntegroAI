import { useState } from 'react'

const INTEGRATIONS = [
  { id:'salesforce', name:'Salesforce',         cat:'CRM',         desc:'CRM sync — contacts, opportunities, activities' },
  { id:'hubspot',    name:'HubSpot',             cat:'Marketing',   desc:'Marketing automation and contact management' },
  { id:'linkedin',   name:'LinkedIn Sales Nav',  cat:'Outbound',    desc:'Prospecting, InMail, and connection automation' },
  { id:'apollo',     name:'Apollo.io',           cat:'Outbound',    desc:'Contact data, enrichment, and sequence triggers' },
  { id:'slack',      name:'Slack',               cat:'Comms',       desc:'Agent alerts, approvals, and team notifications' },
  { id:'gong',       name:'Gong',                cat:'Intelligence',desc:'Call analysis and coaching signal extraction' },
]

export default function IntegrationsView({ active, addToast }: { active: boolean; addToast: (m: string) => void }) {
  const [conn, setConn] = useState<Record<string,boolean>>({ salesforce:false, hubspot:false, linkedin:false, apollo:false, slack:false, gong:false })
  const toggle = (id: string, name: string) => {
    setConn(p => { const next = !p[id]; addToast(`${name} ${next ? 'connected ✓' : 'disconnected'}`); return { ...p, [id]: next } })
  }
  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="view-header">
        <div><div className="view-subtitle">Connected Tools</div><h1 className="display view-title">Integrations</h1></div>
        <div className="view-actions">
          <button className="btn-sm btn-sm-primary" onClick={() => addToast('Integration marketplace — coming soon')}>+ Add Integration</button>
        </div>
      </div>
      <div className="grid-2">
        {INTEGRATIONS.map(int => (
          <div key={int.id} className="card" style={{ display:'flex', alignItems:'center', gap:16 }}>
            <div style={{ width:44, height:44, borderRadius:'var(--radius-sm)', background:conn[int.id]?'var(--ink)':'var(--cream-dd)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'background 0.25s' }}>
              <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:14, color:conn[int.id]?'var(--orange)':'var(--ink-l)' }}>{int.name.slice(0,2).toUpperCase()}</span>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                <span style={{ fontSize:13, fontWeight:500 }}>{int.name}</span>
                <span className="mono" style={{ fontSize:9, letterSpacing:'0.07em', textTransform:'uppercase', padding:'2px 7px', borderRadius:'var(--radius-pill)', background:'rgba(255,255,255,0.4)', border:'1px solid rgba(255,255,255,0.5)', color:'var(--ink-l)' }}>{int.cat}</span>
              </div>
              <div style={{ fontSize:12, color:'var(--ink-l)' }}>{int.desc}</div>
            </div>
            <button className={`btn-sm ${conn[int.id]?'btn-sm-ghost':'btn-sm-primary'}`} style={{ fontSize:11, padding:'5px 14px', flexShrink:0 }} onClick={() => toggle(int.id, int.name)}>
              {conn[int.id] ? 'Connected' : 'Connect'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
