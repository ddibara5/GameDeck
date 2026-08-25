import { GoTrueClient } from '@supabase/auth-js'
import { PostgrestClient } from '@supabase/postgrest-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'GameDeck: missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables.'
  )
}

const baseUrl = (supabaseUrl || 'https://invalid.local').replace(/\/+$/, '')
const apiKey = supabaseAnonKey || 'missing'

// Only the two Supabase subsystems GameDeck actually uses are instantiated.
// This preserves the small, stable vendor chunk while adding passwordless auth;
// the full client also eagerly includes realtime, storage, and edge functions.
const auth = new GoTrueClient({
  url: `${baseUrl}/auth/v1`,
  headers: { apikey: apiKey },
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
