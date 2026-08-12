// Client helpers for the Discover "Browse" experience.
// Talks to the /api/discover serverless proxy (IGDB) and to Supabase for the
// user's own library titles (so we can badge games already owned).

import { supabase } from './supabase.js'

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

export async function fetchDiscoverHome(keys, limit = 20) {
  const list = (keys || []).filter(Boolean)
  if (!list.length) return {}
  const cacheKey = `${list.join(',')}|${limit}`
  if (_homeCache.has(cacheKey)) return _homeCache.get(cacheKey)

  const qs = new URLSearchParams({ home: list.join(','), limit: String(limit) })
  const res = await fetch(`/api/discover?${qs.toString()}`)
  if (!res.ok) throw new Error(`Discover home failed (${res.status})`)
  const data = await res.json()
  const rails = data && data.rails && typeof data.rails === 'object' ? data.rails : {}
  _homeCache.set(cacheKey, rails)
  return rails
}

// Fetch a single IGDB game by its id (normalized shape), for the game sheet to
// enrich owned / wishlisted games with a summary + screenshots. Cached per id.
export async function fetchGameById(igdbId) {
  const id = Number(igdbId)
  if (!id) return null
  const games = await fetchDiscover({ ids: id })
  return games[0] || null
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

export function loadGamePass() {
  if (!_gpPromise) {
    _gpPromise = supabase
      .from('gamepass')
      .select('igdb_id, name, cover, year, rating, released')
      .order('rating', { ascending: false, nullsFirst: false })
      .then(({ data, error }) => {
        if (error) return []
        return (data || []).map((r) => ({
          id: r.igdb_id,
          name: r.name,
          cover: r.cover,
          year: r.year,
          rating: r.rating,
          released: r.released,
        }))
      })
      .catch(() => [])
  }
  return _gpPromise
}

let _libPromise = null

export function loadLibraryTitles() {
  if (!_libPromise) {
    _libPromise = supabase
      .from('games')
      .select('title')
      .then(({ data }) => {
        const set = new Set()
        ;(data || []).forEach((r) => {
          const n = normTitle(r.title)
          if (n) set.add(n)
        })
        return set
      })
      .catch(() => new Set())
  }
  return _libPromise
}
