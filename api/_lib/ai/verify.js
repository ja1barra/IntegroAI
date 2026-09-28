// Post-generation verification: the model may only cite evidence it was given,
// and may not introduce figures that are not in the authorized data.

const NUM = /\d[\d,]*(?:\.\d+)?/g
const norm = s => String(s).replace(/,/g, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')

export function numbersIn(text) {
  return [...String(text ?? '').matchAll(NUM)].map(m => norm(m[0]))
}

// Every number found anywhere in `data` (values and nested strings), plus
// rounded variants and percentages of ratios.
export function collectAllowedNumbers(data) {
  const out = new Set()
  const add = n => {
    if (!Number.isFinite(n)) return
    out.add(norm(String(n))); out.add(norm(String(Math.round(n)))); out.add(norm(String(Math.floor(n)))); out.add(norm(n.toFixed(1))); out.add(norm(n.toFixed(2)))
    if (n > 0 && n <= 1) out.add(norm(String(Math.round(n * 100))))
    if (Math.abs(n) >= 1000) { out.add(norm(String(Math.round(n / 1000)))); out.add(norm((n / 1000).toFixed(1))) }
    if (Math.abs(n) >= 1_000_000) out.add(norm((n / 1_000_000).toFixed(1)))
  }
  const walk = v => {
    if (v === null || v === undefined) return
    if (typeof v === 'number') return add(v)
    if (typeof v === 'string') { for (const m of v.matchAll(NUM)) add(Number(norm(m[0]))); return }
    if (Array.isArray(v)) return v.forEach(walk)
    if (typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(data)
  return out
}

/** -> { ok, unverified: string[] }. Small integers (<= 10) are allowed as prose. */
export function verifyNumbers(text, allowed) {
  const bad = numbersIn(text).filter(n => !allowed.has(n) && !(/^\d+$/.test(n) && Number(n) <= 10))
  return { ok: bad.length === 0, unverified: [...new Set(bad)] }
}

export function verifyCitations(ids, allowedIds) {
  const list = Array.isArray(ids) ? ids : []
  const valid = list.filter(id => allowedIds.has(id))
  return { valid: [...new Set(valid)], rejected: list.filter(id => !allowedIds.has(id)) }
}
