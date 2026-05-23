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

  const base = (instanceUrl || 'https://login.salesforce.com').replace(/\/$/, '')

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
