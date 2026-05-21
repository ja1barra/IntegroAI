import EmptyState from '../components/ui/EmptyState'

export default function PlaybooksView({ active, addToast }: { active: boolean; addToast: (m: string) => void }) {
  return (
    <div className={`view ${active ? 'active' : ''}`}>
      <div className="view-header">
        <div><div className="view-subtitle">Strategy Library</div><h1 className="display view-title">Playbooks</h1></div>
        <div className="view-actions">
          <button className="btn-sm btn-sm-primary" onClick={() => addToast('Playbook builder — coming soon')}>+ New Playbook</button>
        </div>
      </div>
      <div className="card">
        <EmptyState
          icon="playbook"
          title="No playbooks yet"
          desc="Your playbook library is empty. Create your first playbook or connect your CRM so the Growth Playbooks agent can generate them automatically."
          action={{ label: '+ New Playbook', onClick: () => addToast('Playbook builder — coming soon') }}
        />
      </div>
    </div>
  )
}
