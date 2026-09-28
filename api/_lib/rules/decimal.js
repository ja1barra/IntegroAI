// Exact decimal arithmetic for money. Amounts travel as strings (as PostgREST
// returns `numeric`) and are summed as scaled BigInts — never as floats.

const SCALE = 6

export function parseDecimal(v) {
  if (v === null || v === undefined || v === '') return null
  const s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : null) : String(v).trim()
  if (s === null || !/^-?\d+(\.\d+)?$/.test(s)) return null
  const neg = s.startsWith('-')
  const [i, f = ''] = s.replace('-', '').split('.')
  const frac = (f + '0'.repeat(SCALE)).slice(0, SCALE)
  const n = BigInt(i) * 10n ** BigInt(SCALE) + BigInt(frac)
  return neg ? -n : n
}

export function cmpDecimal(a, b) {
  const x = parseDecimal(a), y = parseDecimal(b)
  if (x === null || y === null) return null
  return x < y ? -1 : x > y ? 1 : 0
}

export function formatDecimal(n) {
  if (n === null) return null
  const neg = n < 0n
  const abs = neg ? -n : n
  const s = abs.toString().padStart(SCALE + 1, '0')
  const i = s.slice(0, -SCALE)
  const f = s.slice(-SCALE).replace(/0+$/, '')
  return (neg ? '-' : '') + i + (f ? '.' + f : '')
}

// Sum many decimals; returns { sum: string, unknown: number } where `unknown`
// counts inputs that were null/unparseable (they are NOT treated as zero).
export function sumDecimals(values) {
  let total = 0n, unknown = 0
  for (const v of values) {
    const d = parseDecimal(v)
    if (d === null) unknown++
    else total += d
  }
  return { sum: formatDecimal(total), unknown }
}
