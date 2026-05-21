import type { Tweaks } from '../../types'
import { Icon } from '../ui/Icon'

interface Props {
  tweaks: Tweaks
  setTweak: (key: keyof Tweaks, value: Tweaks[keyof Tweaks]) => void
  onClose: () => void
}

function Btn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ flex: 1, padding: '6px 0', fontSize: 11, fontFamily: "'DM Mono',monospace", border: `1px solid ${active ? 'var(--orange)' : 'var(--rule)'}`, borderRadius: 'var(--radius-pill)', background: active ? 'var(--orange)' : 'transparent', color: active ? 'var(--cream)' : 'var(--ink)', cursor: 'pointer', transition: 'all 0.15s' }}>
      {children}
    </button>
  )
}

export default function TweaksPanel({ tweaks, setTweak, onClose }: Props) {
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, width: 230, background: 'var(--glass)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--glass-shadow)', zIndex: 400, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', background: 'var(--ink)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream)' }}>Tweaks</span>
        <span style={{ cursor: 'pointer', color: 'rgba(245,240,232,0.45)', lineHeight: 1, display: 'inline-flex', alignItems: 'center' }} onClick={onClose}>
          <Icon name="close" size={14} />
        </span>
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 7 }}>Theme</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <Btn active={!tweaks.darkMode} onClick={() => setTweak('darkMode', false)}>Light</Btn>
            <Btn active={tweaks.darkMode}  onClick={() => setTweak('darkMode', true)}>Dark</Btn>
          </div>
        </div>
        <div>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 7 }}>Accent</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {([['orange','#d4501a'],['teal','#0ea5a0'],['violet','#7c3aed']] as [string,string][]).map(([name, hex]) => (
              <div key={name} onClick={() => setTweak('accentColor', name as Tweaks['accentColor'])} style={{ width: 26, height: 26, borderRadius: '50%', background: hex, cursor: 'pointer', border: `2.5px solid ${tweaks.accentColor === name ? 'var(--ink)' : 'transparent'}`, transition: 'border-color 0.15s' }} />
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-l)', marginBottom: 7 }}>Density</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <Btn active={tweaks.density === 'default'} onClick={() => setTweak('density', 'default')}>Default</Btn>
            <Btn active={tweaks.density === 'compact'} onClick={() => setTweak('density', 'compact')}>Compact</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
