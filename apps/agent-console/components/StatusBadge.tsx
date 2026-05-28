const styles: Record<string, string> = {
  pending:   'bg-accent/20 text-accent border-accent/30',
  approved:  'bg-green-500/20 text-green-400 border-green-500/30',
  rejected:  'bg-danger/20 text-danger/70 border-danger/30',
  running:   'bg-accent/20 text-accent border-accent/30',
  completed: 'bg-green-500/20 text-green-400 border-green-500/30',
  failed:    'bg-danger/20 text-danger/70 border-danger/30',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center text-xs font-mono px-2 py-0.5 rounded border ${styles[status] ?? 'bg-white/10 text-muted border-white/10'}`}>
      {status}
    </span>
  )
}
