// Time helpers. Everything is stored/compared in UTC; "local day" questions
// are answered in the organization's IANA timezone, with `as_of` always
// explicit (the engine never reads the clock).

const DAY_MS = 86400000
export { DAY_MS }

export function toMs(v) {
  if (v === null || v === undefined || v === '') return null
  const t = v instanceof Date ? v.getTime() : Date.parse(v)
  return Number.isNaN(t) ? null : t
}

const fmtCache = new Map()
function fmt(tz) {
  let f = fmtCache.get(tz)
  if (!f) { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }); fmtCache.set(tz, f) }
  return f
}

// 'YYYY-MM-DD' of an instant in a timezone.
export function localDate(ms, tz = 'UTC') {
  return fmt(tz).format(new Date(ms))
}

// HubSpot stores date-picker values (e.g. closedate) as UTC midnight. Reading
// that instant in a western timezone would shift it to the previous day, so a
// value at exactly 00:00:00.000Z is treated as the calendar date it encodes;
// any other instant is converted to the org's local date.
export function closeLocalDate(closeMs, tz = 'UTC') {
  const d = new Date(closeMs)
  const isUtcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0
  return isUtcMidnight ? d.toISOString().slice(0, 10) : localDate(closeMs, tz)
}
