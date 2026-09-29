// Central place for server configuration. Never log values from here.

const trim = v => (typeof v === 'string' ? v.trim().replace(/\/$/, '') : undefined)

export function cfg(env = process.env) {
  return {
    supabaseUrl: trim(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
    // The anon key is public by design (also shipped to the browser).
    anonKey: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY,
    // Server-only. Never prefix with VITE_.
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    appBaseUrl: trim(env.APP_BASE_URL),
    hubspot: {
      clientId: env.HUBSPOT_CLIENT_ID,
      clientSecret: env.HUBSPOT_CLIENT_SECRET,
      redirectUri: env.HUBSPOT_REDIRECT_URI,
      apiBase: trim(env.HUBSPOT_API_BASE) || 'https://api.hubapi.com',
      authorizeUrl: env.HUBSPOT_AUTHORIZE_URL || 'https://app.hubspot.com/oauth/authorize',
    },
    openai: {
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
      timeoutMs: Number(env.OPENAI_TIMEOUT_MS) || 45000,
      maxRetries: Number.isFinite(Number(env.OPENAI_MAX_RETRIES)) && env.OPENAI_MAX_RETRIES !== undefined ? Number(env.OPENAI_MAX_RETRIES) : 2,
      maxOutputTokens: Number(env.OPENAI_MAX_OUTPUT_TOKENS) || 1800,
    },
    workerSecret: env.REVENUE_WORKER_SECRET || env.CRON_SECRET,
    autoSyncHours: Number.isFinite(Number(env.REVENUE_AUTO_SYNC_HOURS)) && env.REVENUE_AUTO_SYNC_HOURS !== undefined ? Number(env.REVENUE_AUTO_SYNC_HOURS) : 6,
    workerBudgetMs: Number(env.REVENUE_WORKER_BUDGET_MS) || 40000,
    encryption: {
      key: env.CREDENTIALS_ENCRYPTION_KEY,
      keyId: env.CREDENTIALS_ENCRYPTION_KEY_ID || '1',
      previous: env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS, // "<id>:<base64>[,<id>:<base64>]"
    },
    hubspotWriteScopeRequested: env.HUBSPOT_REQUEST_WRITE_SCOPES === 'true',
  }
}
