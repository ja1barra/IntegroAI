const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { endpoint, accessToken, httpMethod = 'GET' } = req.body ?? {}
  if (!accessToken || !endpoint) return res.status(400).json({ error: 'Missing accessToken or endpoint' })

  try {
    const orRes = await fetch(`https://api.outreach.io${endpoint}`, {
      method: httpMethod.toUpperCase(),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/vnd.api+json',
      },
    })
    const data = await orRes.json()
    return res.status(orRes.status).json(data)
  } catch (err) {
    return res.status(500).json({ error: err?.message ?? 'Outreach proxy error' })
  }
}
