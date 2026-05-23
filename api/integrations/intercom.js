const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { endpoint, accessToken, httpMethod = 'GET', body } = req.body ?? {}
  if (!accessToken || !endpoint) return res.status(400).json({ error: 'Missing accessToken or endpoint' })

  const method = httpMethod.toUpperCase()

  try {
    const icRes = await fetch(`https://api.intercom.io${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Intercom-Version': '2.10',
      },
      ...(method !== 'GET' && body && { body: JSON.stringify(body) }),
    })
    const data = await icRes.json()
    return res.status(icRes.status).json(data)
  } catch (err) {
    return res.status(500).json({ error: err?.message ?? 'Intercom proxy error' })
  }
}
