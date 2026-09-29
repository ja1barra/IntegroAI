// Minimal HubSpot REST client: bounded retries, Retry-After, throttled Search.
// Fixed to the CRM v3 object APIs + v4 associations (see docs/revenue/hubspot-capabilities.md).

export class HubSpotError extends Error {
  constructor(status, message, extra = {}) { super(message); this.name = 'HubSpotError'; this.status = status; Object.assign(this, extra) }
}
export class HubSpotRateLimited extends HubSpotError {
  constructor(retryAfterMs) { super(429, 'HubSpot rate limit reached', { retryAfterMs, retryable: true }) }
}
export class HubSpotForbidden extends HubSpotError {
  constructor(path, category) { super(403, 'HubSpot denied this request (missing scope or plan)', { path, category }) }
}
export class ReconnectRequired extends Error {
  constructor(msg = 'HubSpot connection must be re-authorized') { super(msg); this.name = 'ReconnectRequired' }
}

const defaultSleep = ms => new Promise(r => setTimeout(r, ms))

export function createHubSpotClient({ apiBase = 'https://api.hubapi.com', getToken, fetchImpl = fetch, sleep = defaultSleep, random = Math.random, searchGapMs = 260, maxInlineWaitMs = 4000, maxRetries = 3 }) {
  let lastSearchAt = 0

  async function request(method, path, { body, query } = {}) {
    const url = new URL(apiBase + path)
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    const isSearch = path.endsWith('/search')
    let forceNext = false, refreshedOn401 = false
    for (let attempt = 0; ; attempt++) {
      if (isSearch) { const wait = lastSearchAt + searchGapMs - Date.now(); if (wait > 0) await sleep(wait); lastSearchAt = Date.now() }
      const token = await getToken({ force: forceNext })
      forceNext = false // only the attempt right after a 401 forces a refresh; later retries reuse whatever is current
      let res
      try {
        res = await fetchImpl(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(25000) })
      } catch (e) {
        if (attempt < maxRetries && method === 'GET') { await sleep(300 * 2 ** attempt + random() * 200); continue }
        throw new HubSpotError(0, 'HubSpot unreachable', { retryable: true })
      }
      if (res.ok) return res.status === 204 ? null : await res.json().catch(() => null)
      const err = await res.json().catch(() => ({}))
      if (res.status === 401 && !refreshedOn401) { refreshedOn401 = true; forceNext = true; continue }
      if (res.status === 401) throw new ReconnectRequired('HubSpot rejected the access token')
      if (res.status === 403) throw new HubSpotForbidden(path, err?.category)
      if (res.status === 429) {
        const ra = Number(res.headers.get('retry-after')); const waitMs = (Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000 * 2 ** attempt) + Math.floor(random() * 250)
        if (waitMs <= maxInlineWaitMs && attempt < maxRetries) { await sleep(waitMs); continue }
        throw new HubSpotRateLimited(waitMs)
      }
      if (res.status >= 500 && attempt < maxRetries && (method === 'GET' || isSearch || path.includes('/batch/read'))) { await sleep(400 * 2 ** attempt + random() * 250); continue }
      throw new HubSpotError(res.status, `HubSpot API error ${res.status}${err?.category ? ` (${err.category})` : ''}`, { category: err?.category, retryable: res.status >= 500 })
    }
  }
  return {
    get: (path, query) => request('GET', path, { query }),
    post: (path, body, query) => request('POST', path, { body, query }),
    request,
  }
}

// Iterate a cursor-paginated list endpoint (results[] + paging.next.after).
export async function* paginate(fetchPage, { startAfter, maxPages = Infinity } = {}) {
  let after = startAfter, pages = 0
  do {
    const data = await fetchPage(after)
    yield { results: data?.results ?? [], after: data?.paging?.next?.after ?? null }
    after = data?.paging?.next?.after
    pages++
  } while (after && pages < maxPages)
}
