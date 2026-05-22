import { supabase } from '../supabase'

export async function saveCredential(
  provider: string,
  apiKey: string,
  extras?: { workspaceName?: string; recordCount?: number }
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await supabase.from('integrations').upsert({
    user_id: user.id,
    provider,
    connected: true,
    key_encrypted: apiKey,
    ...(extras?.workspaceName !== undefined && { workspace_name: extras.workspaceName }),
    ...(extras?.recordCount !== undefined && { record_count: extras.recordCount }),
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,provider' })
}

export async function loadCredential(provider: string): Promise<string | null> {
  const { data } = await supabase
    .from('integrations')
    .select('key_encrypted')
    .eq('provider', provider)
    .single()
  return data?.key_encrypted ?? null
}

export async function markError(provider: string, message: string): Promise<void> {
  await supabase
    .from('integrations')
    .update({ error_message: message, updated_at: new Date().toISOString() })
    .eq('provider', provider)
}

export async function clearError(provider: string): Promise<void> {
  await supabase
    .from('integrations')
    .update({ error_message: null, updated_at: new Date().toISOString() })
    .eq('provider', provider)
}

export async function updateSyncMeta(
  provider: string,
  meta: { recordCount?: number; workspaceName?: string }
): Promise<void> {
  await supabase
    .from('integrations')
    .update({
      ...(meta.recordCount !== undefined && { record_count: meta.recordCount }),
      ...(meta.workspaceName && { workspace_name: meta.workspaceName }),
      last_synced_at: new Date().toISOString(),
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('provider', provider)
}
