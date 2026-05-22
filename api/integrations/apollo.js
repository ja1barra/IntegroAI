const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { endpoint, apiKey, body, httpMethod = 'POST' } = req.body ?? {}

  if (!apiKey || !endpoint) {
    return res.status(400).json({ error: 'Missing required fields: endpoint and apiKey' })
  }

  const method = httpMethod.toUpperCase()

  try {
    const apolloRes = await fetch(`https://api.apollo.io${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'Cache-Control': 'no-cache',
      },
      ...(method !== 'GET' && { body: JSON.stringify(body ?? {}) }),
    })

    const data = await apolloRes.json()
    return res.status(apolloRes.status).json(data)
  } catch (err) {
    return res.status(500).json({ error: err?.message ?? 'Apollo proxy error' })
  }
}
