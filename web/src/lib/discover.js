// Client helpers for the Discover "Browse" experience.
// Talks to the /api/discover serverless proxy (IGDB) and to Supabase for the
// user's own library titles (so we can badge games already owned).

import { supabase } from './supabase.js'
import { swr, idbGet, idbSet } from './idbCache.js'

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

// Batched taste lanes for the For You feed. Same shape and the same reason as
// fetchDiscoverHome: one round trip, the lanes run in parallel server-side.
// Returns { laneKey: games[] }.
const LANE_TTL = 30 * 60 * 1000

async function fetchLanesNetwork(list, limit, platform) {
  const qs = new URLSearchParams({ lanes: list.join(','), limit: String(limit) })
  if (platform && platform !== 'all') qs.set('platform', platform)
  const res = await fetch(`/api/discover?${qs.toString()}`)
  if (!res.ok) throw new Error(`Discover lanes failed (${res.status})`)
  const data = await res.json()
  return data && data.lanes && typeof data.lanes === 'object' ? data.lanes : {}
}

export async function fetchDiscoverLanes(keys, limit = 8, { onFresh, platform } = {}) {
  const list = (keys || []).filter(Boolean)
  if (!list.length) return {}
  // The platform set is part of this payload's identity, exactly as the filter
  // selection is for the home rails: without it, turning a platform chip on
  // would be answered off disk with the narrower set.
  const cacheKey = `${list.join(',')}|${limit}|${platform || 'all'}`
  const { value } = await swr(`discover:lanes:${cacheKey}`, () => fetchLanesNetwork(list, limit, platform), {
    maxAge: LANE_TTL,
    onFresh: (lanes) => {
      if (onFresh) onFresh(lanes)
    },
  })
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

// IGDB caps a by-id lookup at 20 ids per request (see the api/discover ids
// branch), so ask in chunks and merge.
const ID_CHUNK = 20

/**
 * Batch-fetch normalized IGDB records for a set of ids, keyed by id.
 *
 * The wishlist rails are built from locally stored rows that only carry
 * title/cover/year, so their cards had no countdown, no rating and no real
 * release date - visibly different from every IGDB-backed rail beside them.
 * This gives them the same fields the rails get. Persisted for a week: a game's
 * release timestamp does not move, and the "in 4d" label is derived from it on
 * each render rather than being stored.
 */
export async function fetchGamesByIds(ids) {
  const list = [...new Set((ids || []).map(Number).filter(Boolean))]
  if (!list.length) return {}

  // Cached per id under the SAME key the game sheet uses, not per batch. Keying
  // by batch would mean adding one wishlist entry reshuffles the chunk
  // boundaries and invalidates every one of them; per id, a new entry costs a
  // single lookup, and a game whose sheet you have already opened is free.
  const out = {}
  const missing = []
  await Promise.all(
    list.map(async (id) => {
      const hit = await idbGet(`discover:game:${id}`)
      if (hit && hit.value && Date.now() - hit.ts < GAME_TTL) out[id] = hit.value
      else missing.push(id)
    })
  )
  if (!missing.length) return out

  const chunks = []
  for (let i = 0; i < missing.length; i += ID_CHUNK) chunks.push(missing.slice(i, i + ID_CHUNK))
  const fetched = await Promise.all(
    chunks.map((chunk) => fetchDiscover({ ids: chunk.join(','), limit: chunk.length }).catch(() => []))
  )
  fetched.flat().forEach((g) => {
    if (g && g.id != null) {
      out[g.id] = g
      idbSet(`discover:game:${g.id}`, g)
    }
  })
  return out
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
    .select('igdb_id, name, cover, year, rating, released, leaving_soon')
    .order('rating', { ascending: false, nullsFirst: false })
  if (error) throw new Error(error.message || 'Game Pass request failed')
  return (data || []).map((r) => ({
    id: r.igdb_id,
    name: r.name,
    cover: r.cover,
    year: r.year,
    rating: r.rating,
    released: r.released,
    // Membership only. Microsoft's "Leaving soon" collection publishes no departure
    // date, so this must never be rendered as a countdown.
    leaving_soon: Boolean(r.leaving_soon),
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

// The leaving-soon subset, for the Home card.
//
// Deliberately NOT loadGamePass() filtered, even though that payload carries
// `leaving_soon` and is already cached. That cache has a 12 hour TTL, which is
// right for a Discover rail and wrong here: this card was a live query on every
// launch, and folding it into the catalog would have let it sit up to half a day
// behind. Same module as fetchGamePass so the two column lists cannot drift.
//
// maxAge 0: the rows are served off disk on the first frame AND refreshed every
// launch, so the card keeps the freshness it had and stops blocking the screen.
export async function loadLeavingSoon(onFresh) {
  const { value } = await swr(
    'gamepass:leaving',
    async () => {
      const { data, error } = await supabase
        .from('gamepass')
        .select('igdb_id, name, cover, year, rating')
        .eq('leaving_soon', true)
      if (error) throw new Error(error.message || 'Game Pass request failed')
      return (data || []).filter((r) => r && r.igdb_id != null)
    },
    { maxAge: 0, onFresh },
  ).catch(() => ({ value: [] }))
  return value || []
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
