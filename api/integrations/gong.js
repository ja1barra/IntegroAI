const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { endpoint, accessKey, accessSecret } = req.body ?? {}
  if (!accessKey || !endpoint) return res.status(400).json({ error: 'Missing accessKey or endpoint' })

  const credentials = Buffer.from(`${accessKey}:${accessSecret ?? ''}`).toString('base64')

  try {
    const gongRes = await fetch(`https://api.gong.io${endpoint}`, {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
    })
    const data = await gongRes.json()
    return res.status(gongRes.status).json(data)
  } catch (err) {
    return res.status(500).json({ error: err?.message ?? 'Gong proxy error' })
  }
}
