import { supabase } from '../supabase'
import type { AIProviderSettings } from './types'

export async function loadAIProviderSettings(): Promise<AIProviderSettings | null> {
  const { data } = await supabase
    .from('ai_provider_settings')
    .select('provider, api_key, base_url, model')
    .maybeSingle()
  if (!data) return null
  return {
    provider: data.provider,
    apiKey: data.api_key,
    baseUrl: data.base_url ?? undefined,
    model: data.model ?? undefined,
  }
}

export async function saveAIProviderSettings(settings: AIProviderSettings): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await supabase.from('ai_provider_settings').upsert({
    user_id: user.id,
    provider: settings.provider,
    api_key: settings.apiKey,
    base_url: settings.baseUrl || null,
    model: settings.model || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
}

export async function clearAIProviderSettings(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('ai_provider_settings').delete().eq('user_id', user.id)
}

export interface TestProviderResult {
  ok: boolean
  error?: string
  sample?: string
}

// Verifies not-yet-saved credentials by round-tripping through the
// generate-sequence endpoint's "test-provider" kind (server-side, so the
// key is never exposed to a third-party API straight from the browser and
// CORS/mixed-content isn't a concern for providers that don't allow it).
export async function testAIProviderSettings(settings: AIProviderSettings): Promise<TestProviderResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch('/api/agent/generate-sequence', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({
        kind: 'test-provider',
        provider: settings.provider,
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: settings.model,
      }),
    })
    const data = await r.json().catch(() => ({} as TestProviderResult))
    if (!r.ok) return { ok: false, error: data.error ?? `Test failed (${r.status})` }
    return { ok: !!data.ok, error: data.error, sample: data.sample }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}
