import { getLocale } from './i18n'

// Display only. Sums come from the server as exact decimal strings and are never recomputed here.
export function formatMoney(amount: string | null | undefined, currency: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '—'
  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'
  if (!currency) return `${new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 0 }).format(n)} (currency unknown)`
  try {
    return new Intl.NumberFormat(getLocale(), { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
  } catch {
    return `${n.toLocaleString()} ${currency}`
  }
}

export function formatDate(iso: string | null | undefined, tz?: string | null, withTime = false): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  try {
    return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', ...(withTime ? { timeStyle: 'short' } : {}), ...(tz ? { timeZone: tz } : {}) } as Intl.DateTimeFormatOptions).format(d)
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

export const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${Math.round(n * 100)}%`)

export function relativeDays(iso: string | null | undefined): string {
  if (!iso) return '—'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  return days <= 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`
}
