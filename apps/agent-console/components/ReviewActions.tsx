'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ReviewActions({ id }: { id: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleAction(status: 'approved' | 'rejected') {
    setLoading(true)
    await fetch(`/api/emails/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex gap-3">
      <button
        onClick={() => handleAction('approved')}
        disabled={loading}
        className="flex-1 py-3 px-5 bg-green-500/20 hover:bg-green-500/30 active:bg-green-500/40 border border-green-500/40 text-green-400 text-sm font-mono rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Approve ✓
      </button>
      <button
        onClick={() => handleAction('rejected')}
        disabled={loading}
        className="flex-1 py-3 px-5 bg-danger/15 hover:bg-danger/25 active:bg-danger/35 border border-danger/35 text-danger/80 text-sm font-mono rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Reject ✗
      </button>
    </div>
  )
}
