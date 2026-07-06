/**
 * OAuth callback handler — exchanges authorization codes for access tokens.
 *
 * Each OAuth provider redirects here after the user approves access.
 * This function exchanges the code for tokens and returns HTML that
 * posts the result back to the opener window via postMessage.
 *
 * Required env vars per provider:
 *   Salesforce:  SALESFORCE_CLIENT_ID, SALESFORCE_CLIENT_SECRET
 *   Outreach:    OUTREACH_CLIENT_ID, OUTREACH_CLIENT_SECRET
 *   LinkedIn:    LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET
 *   Intercom:    INTERCOM_CLIENT_ID, INTERCOM_CLIENT_SECRET
 *   Google/GA4:  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   Slack:       SLACK_CLIENT_ID, SLACK_CLIENT_SECRET
 */

const TOKEN_CONFIGS = {
  salesforce: {
    tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
    clientIdEnv: 'SALESFORCE_CLIENT_ID',
    clientSecretEnv: 'SALESFORCE_CLIENT_SECRET',
    bodyFormat: 'form',
  },
  outreach: {
    tokenUrl: 'https://api.outreach.io/oauth/token',
    clientIdEnv: 'OUTREACH_CLIENT_ID',
    clientSecretEnv: 'OUTREACH_CLIENT_SECRET',
    bodyFormat: 'json',
  },
  linkedin: {
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    clientIdEnv: 'LINKEDIN_CLIENT_ID',
    clientSecretEnv: 'LINKEDIN_CLIENT_SECRET',
    bodyFormat: 'form',
  },
  intercom: {
    tokenUrl: 'https://api.intercom.io/auth/eagle/token',
    clientIdEnv: 'INTERCOM_CLIENT_ID',
    clientSecretEnv: 'INTERCOM_CLIENT_SECRET',
    bodyFormat: 'json',
  },
  ga4: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    bodyFormat: 'form',
  },
  gmail: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    bodyFormat: 'form',
  },
  slack: {
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    clientIdEnv: 'SLACK_CLIENT_ID',
    clientSecretEnv: 'SLACK_CLIENT_SECRET',
    bodyFormat: 'form',
  },
}

function postMessagePage(data) {
  const safeData = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
  const isError = !!data.error
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${isError ? 'Connection failed' : 'Connecting...'}</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #faf7f2; color: #1a1714; }
    .box { text-align: center; padding: 40px; }
    .icon { font-size: 40px; margin-bottom: 16px; }
    .msg { font-size: 14px; color: #7a7268; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="box">
    <div class="icon">${isError ? '⚠️' : '✓'}</div>
    <div style="font-weight:600;font-size:16px">${isError ? 'Connection failed' : 'Connected!'}</div>
    <div class="msg">${isError ? data.error : 'Closing window...'}</div>
  </div>
  <script>
    (function() {
      var payload = ${safeData};
      payload.type = 'integro-oauth';
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, window.location.origin);
        }
      } catch(e) {}
      setTimeout(function() { window.close(); }, 1200);
    })();
  </script>
</body>
</html>`
}

function getRedirectUri(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${proto}://${host}/api/integrations/oauth-callback`
}

export default async function handler(req, res) {
  // Handle both GET (redirect from provider) and POST (direct calls)
  const params = req.method === 'GET' ? req.query : req.body

  const { code, state, error, error_description } = params

  // Extract provider from state param: "provider:uuid"
  const provider = (typeof state === 'string' ? state.split(':')[0] : null) || params.provider

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')

  if (error) {
    return res.status(200).send(postMessagePage({
      error: error_description || `Authorization denied: ${error}`,
    }))
  }

  if (!provider) {
    return res.status(200).send(postMessagePage({ error: 'Missing provider in state parameter' }))
  }

  if (!code) {
    return res.status(200).send(postMessagePage({ error: 'Missing authorization code' }))
  }

  const config = TOKEN_CONFIGS[provider]
  if (!config) {
    return res.status(200).send(postMessagePage({ error: `Unknown OAuth provider: ${provider}` }))
  }

  const clientId = process.env[config.clientIdEnv]
  const clientSecret = process.env[config.clientSecretEnv]

  if (!clientId || !clientSecret) {
    return res.status(200).send(postMessagePage({
      error: `Server not configured for ${provider} OAuth. Add ${config.clientIdEnv} and ${config.clientSecretEnv} to your Vercel environment variables.`,
    }))
  }

  try {
    const redirectUri = getRedirectUri(req)
    const tokenParams = {
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }

    let tokenRes
    if (config.bodyFormat === 'json') {
      tokenRes = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(tokenParams),
      })
    } else {
      tokenRes = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams(tokenParams).toString(),
      })
    }

    const tokens = await tokenRes.json()

    if (!tokenRes.ok || tokens.error) {
      return res.status(200).send(postMessagePage({
        error: tokens.error_description || tokens.error || `Token exchange failed (${tokenRes.status})`,
      }))
    }

    // Normalize Slack's nested token structure
    if (provider === 'slack') {
      if (!tokens.access_token) {
        tokens.access_token = tokens.authed_user?.access_token || tokens.bot?.bot_access_token
      }
      if (tokens.team) tokens.team = tokens.team.name || tokens.team
    }

    return res.status(200).send(postMessagePage({ tokens: { ...tokens, provider } }))
  } catch (err) {
    return res.status(200).send(postMessagePage({
      error: `Token exchange error: ${err?.message ?? 'Unknown error'}`,
    }))
  }
}
