const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { endpoint, accessToken, instanceUrl } = req.body ?? {}
  if (!accessToken || !endpoint) return res.status(400).json({ error: 'Missing accessToken or endpoint' })

  // instanceUrl is client-supplied — only allow real Salesforce hosts to
  // prevent using this proxy as an open SSRF relay for the bearer token.
  let base = 'https://login.salesforce.com'
  if (instanceUrl) {
    let parsed
    try {
      parsed = new URL(instanceUrl)
    } catch {
      return res.status(400).json({ error: 'Invalid instanceUrl' })
    }
    const host = parsed.hostname.toLowerCase()
    const isSalesforceHost = parsed.protocol === 'https:' &&
      (host.endsWith('.salesforce.com') || host.endsWith('.force.com'))
    if (!isSalesforceHost) {
      return res.status(400).json({ error: 'instanceUrl must be a salesforce.com or force.com host' })
    }
    base = `${parsed.protocol}//${host}`
  }

  try {
    const sfRes = await fetch(`${base}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })
    const data = await sfRes.json()
    return res.status(sfRes.status).json(data)
  } catch (err) {
    return res.status(500).json({ error: err?.message ?? 'Salesforce proxy error' })
  }
}
