'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const SAMPLE_PROSPECTS = [
  {
    first_name: 'Alex',
    last_name: 'Rivera',
    email: 'a.rivera@venture-co.com',
    title: 'VP of Revenue',
    company: 'Venture Co',
    website: 'venture-co.com',
  },
]

export function RunAgentButton() {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const router = useRouter()

  async function handleRun() {
    setState('running')
    try {
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospects: SAMPLE_PROSPECTS }),
      })
      if (!res.ok) throw new Error('Run failed')
      setState('done')
      router.refresh()
    } catch {
      setState('error')
    } finally {
      setTimeout(() => setState('idle'), 4000)
    }
  }

  const label =
    state === 'running' ? 'Running...' :
    state === 'done'    ? 'Complete ✓' :
    state === 'error'   ? 'Error — Retry' :
    'Run Agent →'

  return (
    <button
      onClick={handleRun}
      disabled={state === 'running'}
      className="w-full py-2.5 px-4 bg-accent hover:bg-accent/85 disabled:bg-accent/40 disabled:cursor-not-allowed text-cream text-sm font-mono tracking-wide rounded transition-colors"
    >
      {label}
    </button>
  )
}
