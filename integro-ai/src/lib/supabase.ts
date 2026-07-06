import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// A value is "unusable" if it's empty or still one of the .env.example placeholders.
function isPlaceholder(v?: string): boolean {
  if (!v || !v.trim()) return true
  return /your-project-id|your-anon-key|your-project|xxxx|placeholder/i.test(v)
}

// Surface a clear, actionable config error instead of throwing at import time
// (throwing blanks the whole app). App/SignIn read this to show guidance.
export const supabaseConfigError: string | null =
  isPlaceholder(supabaseUrl) || isPlaceholder(supabaseAnonKey)
    ? 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your Vercel project settings (Environment Variables) and redeploy.'
    : null

if (supabaseConfigError) {
  // Visible in the browser console to speed up diagnosis.
  console.error('[Integro AI] ' + supabaseConfigError)
}

// Fall back to a harmless dummy URL so imports never crash; real calls will
// fail with a clear message handled at the UI layer.
export const supabase = createClient(
  isPlaceholder(supabaseUrl) ? 'https://placeholder.supabase.co' : (supabaseUrl as string),
  isPlaceholder(supabaseAnonKey) ? 'placeholder-anon-key' : (supabaseAnonKey as string),
)

// True when a browser fetch to Supabase failed at the network level (backend
// unreachable) rather than returning an auth error. supabase-js surfaces these
// as an AuthRetryableFetchError with message "Failed to fetch".
export function isNetworkError(message?: string): boolean {
  if (!message) return false
  return /failed to fetch|networkerror|network request failed|fetch failed|load failed/i.test(message)
}

// Map raw auth errors to friendly, actionable copy.
export function friendlyAuthError(message?: string): string {
  if (supabaseConfigError) return supabaseConfigError
  if (isNetworkError(message)) {
    return "Can't reach the server. The backend may be waking up (try again in a moment) or the Supabase project is paused / misconfigured."
  }
  return message ?? 'Something went wrong. Please try again.'
}
