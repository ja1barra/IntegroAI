const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// GA4 has two API base URLs depending on the endpoint
function getBaseUrl(endpoint) {
  if (endpoint.startsWith('/v1beta/accountSummaries') || endpoint.startsWith('/v1alpha')) {
    return 'https://analyticsadmin.googleapis.com'
  }
  return 'https://analyticsdata.googleapis.com'
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { endpoint, accessToken, body } = req.body ?? {}
  if (!accessToken || !endpoint) return res.status(400).json({ error: 'Missing accessToken or endpoint' })

  const base = getBaseUrl(endpoint)
  const method = body ? 'POST' : 'GET'

  try {
    const gaRes = await fetch(`${base}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      ...(method === 'POST' && body && { body: JSON.stringify(body) }),
    })
    const data = await gaRes.json()
    return res.status(gaRes.status).json(data)
  } catch (err) {
    return res.status(500).json({ error: err?.message ?? 'GA4 proxy error' })
  }
}
