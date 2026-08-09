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

// --- "In library" matching --------------------------------------------------
// Normalise a title down to comparable letters/digits so "Elden Ring" matches
// "ELDEN RING" and "Marvel's Spider-Man" matches "Marvels Spider Man".
export function normTitle(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '')
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
