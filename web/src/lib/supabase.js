import { GoTrueClient } from '@supabase/auth-js'
import { PostgrestClient } from '@supabase/postgrest-js'

// These are browser-publishable identifiers, not secrets. Environment values
// remain the preferred override, while the checked-in fallback keeps Vercel
// branch previews and local production builds connected to the same RLS-protected
// project when Preview-scoped variables have not been configured.
const PUBLIC_SUPABASE_URL = 'https://eiskobjlvxzwvucgpenk.supabase.co'
const PUBLIC_SUPABASE_KEY = 'sb_publishable_Rfcg7pTWt0Vq7ep3WQYFvQ_anT_mnX7'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || PUBLIC_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || PUBLIC_SUPABASE_KEY

const baseUrl = supabaseUrl.replace(/\/+$/, '')
const apiKey = supabaseAnonKey
const AUTH_REQUEST_TIMEOUT_MS = 15000

async function authFetchWithTimeout(input, init = {}) {
  const controller = new AbortController()
  const upstreamSignal = init.signal
  const forwardAbort = () => controller.abort(upstreamSignal?.reason)
  if (upstreamSignal) upstreamSignal.addEventListener('abort', forwardAbort, { once: true })
  const timeout = setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
    if (upstreamSignal) upstreamSignal.removeEventListener('abort', forwardAbort)
  }
}

// Only the two Supabase subsystems GameDeck actually uses are instantiated.
// This preserves the small, stable vendor chunk while adding owner-only password auth;
// the full client also eagerly includes realtime, storage, and edge functions.
const auth = new GoTrueClient({
  url: `${baseUrl}/auth/v1`,
  headers: { apikey: apiKey },
  fetch: authFetchWithTimeout,
  storageKey: 'gamedeck-auth-v1',
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
})

const rest = new PostgrestClient(`${baseUrl}/rest/v1`, {
  schema: 'public',
  headers: { apikey: apiKey },
  fetch: async (input, init = {}) => {
    const { data } = await auth.getSession()
    const headers = new Headers(init.headers || {})
    headers.set('apikey', apiKey)
    headers.set('Authorization', `Bearer ${data?.session?.access_token || apiKey}`)
    return fetch(input, { ...init, headers })
  },
})

export const supabase = {
  auth,
  from: rest.from.bind(rest),
  rpc: rest.rpc.bind(rest),
}

export const OWNER_EMAIL = 'ddibara@gmail.com'
