const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { endpoint, accessToken } = req.body ?? {}
  if (!accessToken || !endpoint) return res.status(400).json({ error: 'Missing accessToken or endpoint' })

  try {
    const liRes = await fetch(`https://api.linkedin.com${endpoint}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    })
    const data = await liRes.json()
    return res.status(liRes.status).json(data)
  } catch (err) {
    return res.status(500).json({ error: err?.message ?? 'LinkedIn proxy error' })
  }
}
