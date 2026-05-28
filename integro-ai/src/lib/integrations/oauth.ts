import type { Provider } from './types'

export interface OAuthTokens {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
  instance_url?: string  // Salesforce
  team?: string          // Slack
  authed_user?: { access_token?: string }
}

export interface OAuthResult {
  ok: boolean
  tokens?: OAuthTokens
  error?: string
}

const AUTH_URLS: Partial<Record<Provider, string>> = {
  salesforce: 'https://login.salesforce.com/services/oauth2/authorize',
  outreach:   'https://api.outreach.io/oauth/authorize',
  linkedin:   'https://www.linkedin.com/oauth/v2/authorization',
  intercom:   'https://app.intercom.com/oauth',
  ga4:        'https://accounts.google.com/o/oauth2/v2/auth',
  slack:      'https://slack.com/oauth/v2/authorize',
}

const SCOPES: Partial<Record<Provider, string>> = {
  salesforce: 'api refresh_token offline_access',
  outreach:   'prospects.all accounts.all sequences.all',
  linkedin:   'r_liteprofile r_emailaddress',
  intercom:   'read_contacts write_conversations',
  ga4:        'https://www.googleapis.com/auth/analytics.readonly',
  slack:      'channels:read chat:write users:read',
}

const FALLBACK_CLIENT_IDS: Partial<Record<Provider, string>> = {
  linkedin: '86sagh3d2cd8rs',
}

function getClientId(provider: Provider): string | undefined {
  const key = `VITE_${provider.toUpperCase()}_CLIENT_ID`
  return (import.meta.env as Record<string, string>)[key] ?? FALLBACK_CLIENT_IDS[provider]
}

export function isOAuthProvider(provider: Provider): boolean {
  return provider in AUTH_URLS
}

export function buildOAuthUrl(provider: Provider): string | null {
  const authUrl = AUTH_URLS[provider]
  const clientId = getClientId(provider)
  if (!authUrl || !clientId) return null

  const state = `${provider}:${crypto.randomUUID()}`
  sessionStorage.setItem('integro_oauth_state', state)

  const redirectUri = `${window.location.origin}/api/integrations/oauth-callback`
  const scope = SCOPES[provider] ?? ''

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    response_type: 'code',
    state,
  })

  if (provider === 'salesforce' || provider === 'ga4') {
    params.set('access_type', 'offline')
    params.set('prompt', 'consent')
  }

  return `${authUrl}?${params}`
}

export function startOAuthFlow(provider: Provider): Promise<OAuthResult> {
  const url = buildOAuthUrl(provider)

  if (!url) {
    const envKey = `VITE_${provider.toUpperCase()}_CLIENT_ID`
    return Promise.resolve({
      ok: false,
      error: `OAuth not configured — add ${envKey} to your .env.local and register the app with ${provider}.`,
    })
  }

  const popup = window.open(url, `integro-oauth-${provider}`, 'width=640,height=720,popup=1,scrollbars=yes')

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve({ ok: false, error: 'OAuth timed out after 5 minutes' })
    }, 5 * 60 * 1000)

    const pollClosed = setInterval(() => {
      if (popup?.closed) {
        cleanup()
        resolve({ ok: false, error: 'OAuth window was closed before completing' })
      }
    }, 1000)

    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return
      if (ev.data?.type !== 'integro-oauth') return
      cleanup()
      popup?.close()
      if (ev.data.error) resolve({ ok: false, error: ev.data.error })
      else resolve({ ok: true, tokens: ev.data.tokens as OAuthTokens })
    }

    function cleanup() {
      clearTimeout(timer)
      clearInterval(pollClosed)
      window.removeEventListener('message', onMessage)
    }

    window.addEventListener('message', onMessage)
  })
}

export function tokensToKey(tokens: OAuthTokens): string {
  return JSON.stringify(tokens)
}

export function keyToTokens(key: string): OAuthTokens | null {
  try {
    const parsed = JSON.parse(key)
    if (parsed && typeof parsed.access_token === 'string') return parsed as OAuthTokens
    return null
  } catch {
    return null
  }
}
