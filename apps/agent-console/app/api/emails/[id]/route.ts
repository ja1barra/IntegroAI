import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { status?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { status } = body
  if (status !== 'approved' && status !== 'rejected') {
    return NextResponse.json({ error: 'status must be "approved" or "rejected"' }, { status: 400 })
  }

  const update: Record<string, unknown> = { status }
  if (status === 'approved') update.approved_at = new Date().toISOString()
  if (status === 'rejected') update.rejected_at = new Date().toISOString()

  const db = getServiceClient()
  const { error } = await db.from('outbound_emails').update(update).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
