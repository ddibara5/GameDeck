// Client helpers for the Discover "Browse" experience.
// Talks to the /api/discover serverless proxy (IGDB) and to Supabase for the
// user's own library titles (so we can badge games already owned).

import { supabase } from './supabase.js'
import { authFetch } from './appAuth.js'
import { swr, idbGetMany, idbSet, idbSetMany } from './idbCache.js'
import { gamePassCatalogAvailable, normalizeGamePassState } from './gamePassState.js'
import { getLibraryGamesCache, getLibraryInflight } from './useLibraryGames.js'

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
// A per-game memory layer above IndexedDB. The persisted cache removes repeat
// network requests, but reading IndexedDB is still asynchronous and therefore
// at least one render too late for a sheet that should open fully composed.
// Values in this map can be read synchronously by GameSheet, while an in-flight
// promise also deduplicates pointer-intent warming and the subsequent click.
const _gameCache = new Map()

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

  const res = await authFetch(`/api/discover?${key}`)
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
const HOME_FILTER_KEYS = ['preset', 'genre', 'platform', 'scale', 'year', 'status', 'sort']

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
  const res = await authFetch(`/api/discover?${qs.toString()}`)
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

async function fetchLanesNetwork(list, limit, platform, scale, refreshToken) {
  const qs = new URLSearchParams({ lanes: list.join(','), limit: String(limit) })
  if (platform && platform !== 'all') qs.set('platform', platform)
  if (scale && scale !== 'all') qs.set('scale', scale)
  // The API ignores this semantically. It only gives a deliberate manual
  // refresh a unique request URL so no browser or edge cache can answer it with
  // the payload the user just asked to replace.
  if (refreshToken) qs.set('refresh', String(refreshToken))
  const res = await authFetch(`/api/discover?${qs.toString()}`)
  if (!res.ok) throw new Error(`Discover lanes failed (${res.status})`)
  const data = await res.json()
  const lanes = data && data.lanes && typeof data.lanes === 'object' ? data.lanes : {}
  const failedKeys = Array.isArray(data?.failedKeys) ? data.failedKeys.filter((key) => list.includes(key)) : []
  if (failedKeys.length === list.length) throw new Error('Discover lanes are temporarily unavailable')
  return { lanes, failedKeys }
}

export async function fetchDiscoverLanes(keys, limit = 8, { onFresh, platform, scale, force = false } = {}) {
  const list = (keys || []).filter(Boolean)
  if (!list.length) return {}
  // Platform and production scale are both part of this payload's identity.
  // Without them, changing a filter could be answered from disk with the prior
  // lane set before the fresh request lands.
  const cacheKey = `${list.join(',')}|${limit}|${platform || 'all'}|${scale || 'all'}`
  if (force) {
    const fresh = await fetchLanesNetwork(list, limit, platform, scale, Date.now())
    idbSet(`discover:lanes:v2:${cacheKey}`, fresh)
    return fresh
  }
  const { value } = await swr(`discover:lanes:v2:${cacheKey}`, () => fetchLanesNetwork(list, limit, platform, scale), {
    maxAge: LANE_TTL,
    onFresh: (result) => {
      if (onFresh) onFresh(result)
    },
  })
  return value || { lanes: {}, failedKeys: [] }
}

// Fetch a single IGDB game by its id (normalized shape), for the game sheet to
// enrich owned / wishlisted games with a summary + screenshots.
//
// Persisted per id: a game's blurb, screenshots and studio are effectively
// static, so re-opening a sheet you've seen before resolves off disk with no
// request at all. That is what stops the sheet from popping in its body a beat
// after it slides up.
export function peekGameById(igdbId) {
  const hit = _gameCache.get(Number(igdbId))
  return hit && typeof hit.then !== 'function' ? hit : null
}

export async function fetchGameById(igdbId) {
  const id = Number(igdbId)
  if (!id) return null
  if (_gameCache.has(id)) return _gameCache.get(id)

  const pending = swr(
    `discover:game:${id}`,
    async () => {
      const games = await fetchDiscover({ ids: id })
      return games[0] || null
    },
    { maxAge: GAME_TTL }
  ).then(({ value }) => value || null)

  _gameCache.set(id, pending)
  try {
    const value = await pending
    if (value) _gameCache.set(id, value)
    else _gameCache.delete(id)
    return value
  } catch (error) {
    _gameCache.delete(id)
    throw error
  }
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
  const diskIds = []
  for (const id of list) {
    const memory = _gameCache.get(id)
    if (memory && typeof memory.then !== 'function') out[id] = memory
    else diskIds.push(id)
  }

  const hits = await idbGetMany(diskIds.map((id) => `discover:game:${id}`))
  const missing = []
  for (const id of diskIds) {
    const hit = hits.get(`discover:game:${id}`)
    if (hit && hit.value && Date.now() - hit.ts < GAME_TTL) {
      out[id] = hit.value
      _gameCache.set(id, hit.value)
    } else {
      missing.push(id)
    }
  }
  if (!missing.length) return out

  const chunks = []
  for (let i = 0; i < missing.length; i += ID_CHUNK) chunks.push(missing.slice(i, i + ID_CHUNK))
  const fetched = await Promise.all(
    chunks.map((chunk) => fetchDiscover({ ids: chunk.join(','), limit: chunk.length }).catch(() => []))
  )
  const writes = []
  fetched.flat().forEach((g) => {
    if (g && g.id != null) {
      out[g.id] = g
      _gameCache.set(Number(g.id), g)
      writes.push([`discover:game:${g.id}`, g])
    }
  })
  idbSetMany(writes)
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

// The leaving-soon subset, plus enough catalog metadata for Home to distinguish
// a healthy empty window from a failed/stale feed. A zero-row catalog is never a
// legitimate Game Pass result; no leaving rows inside a populated, fresh catalog
// is. The workflow runs daily, so 36 hours allows normal schedule drift while
// surfacing a missed refresh before a second full day passes.
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
      const [leavingResult, catalogResult] = await Promise.all([
        supabase
          .from('gamepass')
          .select('igdb_id, name, cover, year, rating')
          .eq('leaving_soon', true),
        supabase
          .from('gamepass')
          .select('updated_at', { count: 'exact' })
          .order('updated_at', { ascending: false })
          .limit(1),
      ])
      if (leavingResult.error) throw new Error(leavingResult.error.message || 'Game Pass request failed')
      if (catalogResult.error) throw new Error(catalogResult.error.message || 'Game Pass status request failed')
      const updatedAt = catalogResult.data && catalogResult.data[0] && catalogResult.data[0].updated_at
      return {
        rows: (leavingResult.data || []).filter((r) => r && r.igdb_id != null),
        available: gamePassCatalogAvailable(catalogResult.count, updatedAt),
        updatedAt: updatedAt || null,
      }
    },
    { maxAge: 0, onFresh },
  ).catch(() => ({ value: { rows: [], available: false, updatedAt: null } }))
  // v2 persisted this key as a bare rows array. Keep that disk value usable on
  // the first frame while the mandatory background refresh writes the new state
  // object; an old empty array is treated as unavailable, not healthy-empty.
  return normalizeGamePassState(value)
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
    const toTitles = (games) => new Set((games || []).map((game) => normTitle(game.title)).filter(Boolean))
    const cachedGames = getLibraryGamesCache()
    const libraryRequest = getLibraryInflight()
    if (cachedGames) {
      _libPromise = Promise.resolve(toTitles(cachedGames))
    } else if (libraryRequest) {
      _libPromise = libraryRequest
        .then(() => toTitles(getLibraryGamesCache()))
        .catch(() => new Set())
    } else {
      _libPromise = swr('discover:libraryTitles', fetchLibraryTitles, { maxAge: LIB_TITLES_TTL })
        .then(({ value }) => new Set(value || []))
        .catch(() => new Set())
    }
  }
  return _libPromise
}
