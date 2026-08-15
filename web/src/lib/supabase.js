import { PostgrestClient } from '@supabase/postgrest-js'

// PostgREST directly, rather than the full supabase-js client.
//
// The app's entire use of Supabase is `supabase.from(...)`, at 16 call sites
// across 7 tables. It has no auth, no realtime, no storage and no edge
// functions. supabase-js delegates .from() straight to this same PostgrestClient
// and adds the other four subsystems around it, and createClient instantiates
// all of them eagerly, so nothing tree-shakes. Measured from the build's
// sourcemap, those unused subsystems were 691 kB of the main chunk's 1.14 MB of
// source: auth-js 413 kB, storage-js 107 kB, realtime-js 99 kB, phoenix 55 kB,
// functions-js 17 kB. The query API is identical, so no call site changes.
//
// The two headers below are exactly what supabase-js sends on a REST request
// with no signed-in session, and were verified on the wire rather than read off
// the source: its fetch wrapper sets `apikey` to the key, then sets
// `Authorization: Bearer <session token ?? the key>`. There is no session here,
// so both carry the publishable key.
//
// One trap if this is ever revisited: supabase-js does NOT send a publishable
// (`sb_publishable_...`) key as a bearer token for EDGE FUNCTIONS, only for
// REST. Copying that rule to this client would drop the Authorization header and
// change which Postgres role the request runs as.
//
// X-Client-Info is deliberately not reproduced. It is Supabase's own SDK
// telemetry and nothing in the request depends on it.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly in dev/build logs, but don't crash the whole app render.
  console.error(
    'GameDeck: missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables.'
  )
}

// Same URL construction supabase-js uses, so a VITE_SUPABASE_URL with or without
// a trailing slash resolves the same way it always has.
const restUrl = supabaseUrl ? new URL('rest/v1', `${supabaseUrl.replace(/\/+$/, '')}/`).href : ''

export const supabase = new PostgrestClient(restUrl, {
  headers: {
    apikey: supabaseAnonKey ?? '',
    Authorization: `Bearer ${supabaseAnonKey ?? ''}`,
  },
  // supabase-js defaults db.schema to 'public', which makes PostgrestClient send
  // Accept-Profile / Content-Profile. Kept so the request is byte-identical.
  schema: 'public',
})
