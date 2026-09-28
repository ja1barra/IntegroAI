const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { endpoint, apiKey, body, httpMethod = 'GET' } = req.body ?? {}

  if (!apiKey || !endpoint) {
    return res.status(400).json({ error: 'Missing required fields: endpoint and apiKey' })
  }

  const method = httpMethod.toUpperCase()

  try {
    const hsRes = await fetch(`https://api.hubapi.com${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      ...(method !== 'GET' && body && { body: JSON.stringify(body) }),
    })

    const data = await hsRes.json()
    return res.status(hsRes.status).json(data)
  } catch (err) {
    return res.status(500).json({ error: err?.message ?? 'HubSpot proxy error' })
  }
}
