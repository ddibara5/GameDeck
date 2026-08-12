// Client helpers for the Discover "Browse" experience.
// Talks to the /api/discover serverless proxy (IGDB) and to Supabase for the
// user's own library titles (so we can badge games already owned).

import { supabase } from './supabase.js'
import { swr } from './idbCache.js'

// How long a persisted payload is served without even asking the network.
// Discover rails are editorial-ish lists that barely move hour to hour; the Game
// Pass catalog is rebuilt nightly; library titles only feed the "In library"
// badge. Past these windows the cached value is still shown instantly, it just
// gets refreshed in the background too.
const HOME_TTL = 30 * 60 * 1000 // 30 minutes
const GAMEPASS_TTL = 12 * 60 * 60 * 1000 // 12 hours
const LIB_TITLES_TTL = 60 * 60 * 1000 // 1 hour
const GAME_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days (per-game metadata barely moves)

// --- IGDB catalog fetch (via our serverless proxy) --------------------------
// Results are cached in-memory per query so flipping between Browse and Ask, or
// re-opening a rail, never re-hits the network within a session.
const _cache = new Map()

export function buildQuery(params) {
  const qs = new URLSearchParams()
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v != null && v !== '' && v !== 'all') qs.set(k, String(v))
  })
  return qs.toString()
}

export async function fetchDiscover(params) {
  const key = buildQuery(params)
  if (_cache.has(key)) return _cache.get(key)

  const res = await fetch(`/api/discover?${key}`)
  if (!res.ok) throw new Error(`Discover request failed (${res.status})`)
  const data = await res.json()
  const games = Array.isArray(data.games) ? data.games : []
  _cache.set(key, games)
  return games
}

// Fetch every home rail in ONE request. The server runs the rails' IGDB queries
// in parallel (one warm function, one token) and returns { key: games[] }, so the
// Discover home makes a single round-trip instead of one per rail. Session-cached
// per exact rail set. `keys` is the ordered list of enabled rail keys.
const _homeCache = new Map()

// Only the filters the server actually understands, in a fixed order, so the
// same selection always produces the same cache key.
const HOME_FILTER_KEYS = ['preset', 'genre', 'platform', 'year', 'status', 'sort']

function homeFilterParams(filters) {
  const out = {}
  if (!filters) return out
  for (const k of HOME_FILTER_KEYS) {
    const v = filters[k]
    if (v != null && v !== '' && v !== 'all') out[k] = String(v)
  }
  return out
}

async function fetchHomeNetwork(list, limit, params) {
  const qs = new URLSearchParams({ home: list.join(','), limit: String(limit), ...params })
  const res = await fetch(`/api/discover?${qs.toString()}`)
  if (!res.ok) throw new Error(`Discover home failed (${res.status})`)
  const data = await res.json()
  return data && data.rails && typeof data.rails === 'object' ? data.rails : {}
}

// Local-first: the previous rail payload is persisted, so re-opening the app
// paints the home from disk instead of showing skeletons until IGDB answers.
// Pass `onFresh` to receive a background refresh (only fires when the resolved
// value came off disk, so it never double-applies).
export async function fetchDiscoverHome(keys, limit = 20, { onFresh, filters } = {}) {
  const list = (keys || []).filter(Boolean)
  if (!list.length) return {}
  const params = homeFilterParams(filters)
  // The filter selection is part of the identity of this payload. Leaving it out
  // would serve yesterday's unfiltered rails from disk the moment a filter is on.
  const filterSig = new URLSearchParams(params).toString()
  const cacheKey = `${list.join(',')}|${limit}|${filterSig}`
  if (_homeCache.has(cacheKey)) return _homeCache.get(cacheKey)

  const { value } = await swr(`discover:home:${cacheKey}`, () => fetchHomeNetwork(list, limit, params), {
    maxAge: HOME_TTL,
    onFresh: (rails) => {
      _homeCache.set(cacheKey, rails)
      if (onFresh) onFresh(rails)
    },
  })
  _homeCache.set(cacheKey, value)
  return value
}

// Fetch a single IGDB game by its id (normalized shape), for the game sheet to
// enrich owned / wishlisted games with a summary + screenshots.
//
// Persisted per id: a game's blurb, screenshots and studio are effectively
// static, so re-opening a sheet you've seen before resolves off disk with no
// request at all. That is what stops the sheet from popping in its body a beat
// after it slides up.
export async function fetchGameById(igdbId) {
  const id = Number(igdbId)
  if (!id) return null
  const { value } = await swr(
    `discover:game:${id}`,
    async () => {
      const games = await fetchDiscover({ ids: id })
      return games[0] || null
    },
    { maxAge: GAME_TTL }
  )
  return value || null
}

// --- "In library" matching --------------------------------------------------
// Normalise a title down to comparable letters/digits so "Elden Ring" matches
// "ELDEN RING" and "Marvel's Spider-Man" matches "Marvels Spider Man".
export function normTitle(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '')
}

// Xbox Game Pass catalog, rebuilt nightly by the n8n "Game Pass Catalog Sync"
// workflow into the Supabase `gamepass` table (IGDB-matched, so it renders with
// the same covers/rating/timing as every other rail). Session-cached.
let _gpPromise = null

async function fetchGamePass() {
  const { data, error } = await supabase
    .from('gamepass')
    .select('igdb_id, name, cover, year, rating, released')
    .order('rating', { ascending: false, nullsFirst: false })
  if (error) throw new Error(error.message || 'Game Pass request failed')
  return (data || []).map((r) => ({
    id: r.igdb_id,
    name: r.name,
    cover: r.cover,
    year: r.year,
    rating: r.rating,
    released: r.released,
  }))
}

// Persisted between sessions: the rail renders from disk on open and the catalog
// refreshes in the background once the cached copy is older than GAMEPASS_TTL.
export function loadGamePass() {
  if (!_gpPromise) {
    _gpPromise = swr('discover:gamepass', fetchGamePass, { maxAge: GAMEPASS_TTL })
      .then(({ value }) => value || [])
      .catch(() => [])
  }
  return _gpPromise
}

let _libPromise = null

// Stored as a plain array (not a Set) so the persisted record stays simple and
// inspectable; callers get a Set built from it.
async function fetchLibraryTitles() {
  const { data, error } = await supabase.from('games').select('title')
  if (error) throw new Error(error.message || 'Library titles request failed')
  const seen = new Set()
  ;(data || []).forEach((r) => {
    const n = normTitle(r.title)
    if (n) seen.add(n)
  })
  return Array.from(seen)
}

export function loadLibraryTitles() {
  if (!_libPromise) {
    _libPromise = swr('discover:libraryTitles', fetchLibraryTitles, { maxAge: LIB_TITLES_TTL })
      .then(({ value }) => new Set(value || []))
      .catch(() => new Set())
  }
  return _libPromise
}
