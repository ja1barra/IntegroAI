import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServiceClient } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface Prospect {
  first_name: string
  last_name: string
  email: string
  title: string
  company: string
  website?: string
}

async function generateEmail(p: Prospect): Promise<string> {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Write a short, personalized outbound sales email to ${p.first_name} ${p.last_name}, ${p.title} at ${p.company}${p.website ? ` (${p.website})` : ''}.

From: Integro Strategies — a revenue operations and GTM strategy firm that helps B2B companies build scalable go-to-market systems.

Guidelines:
- 3–4 short paragraphs
- Open with a specific, relevant insight about their role or company
- Connect to a clear pain point
- Single CTA: 15-minute intro call
- Conversational tone, not corporate
- No subject line, just the email body

Output only the email body text.`,
    }],
  })
  return (msg.content[0] as { type: 'text'; text: string }).text
}

export async function POST(req: NextRequest) {
  let body: { prospects?: Prospect[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const prospects = body.prospects
  if (!Array.isArray(prospects) || prospects.length === 0) {
    return NextResponse.json({ error: 'prospects array is required' }, { status: 400 })
  }

  const db = getServiceClient()

  const { data: run, error: runErr } = await db
    .from('agent_runs')
    .insert({ agent_name: 'Agent 01 — Outbound', status: 'running', prospects_count: prospects.length })
    .select()
    .single()

  if (runErr || !run) {
    return NextResponse.json({ error: 'Failed to create agent run' }, { status: 500 })
  }

  try {
    const rows = await Promise.all(
      prospects.map(async (p) => ({
        agent_run_id: run.id,
        first_name:   p.first_name,
        last_name:    p.last_name,
        email:        p.email,
        title:        p.title,
        company:      p.company,
        generated_email: await generateEmail(p),
        status:       'pending',
      }))
    )

    await db.from('outbound_emails').insert(rows)
    await db.from('agent_runs').update({ status: 'completed' }).eq('id', run.id)

    return NextResponse.json({ run_id: run.id, count: rows.length })
  } catch (err) {
    await db.from('agent_runs').update({ status: 'failed' }).eq('id', run.id)
    console.error('[agent/run]', err)
    return NextResponse.json({ error: 'Agent run failed' }, { status: 500 })
  }
}
