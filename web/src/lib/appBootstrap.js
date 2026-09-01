import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { swr } from './idbCache.js'
import { preloadLibrary } from './useLibraryGames.js'

const CACHE_VERSION = 'v1'
const DEFAULT_DAYS = 14
const cacheByDays = new Map()
const inflightByDays = new Map()
const subscribersByDays = new Map()

function normalize(value) {
  const raw = value && typeof value === 'object' ? value : {}
  const recentGames = Array.isArray(raw.recent_games) ? raw.recent_games : []
  const ownedIgdbIds = Array.isArray(raw.owned_igdb_ids)
    ? raw.owned_igdb_ids.map(Number).filter(Boolean)
    : []
  return {
    games: recentGames,
    ownedIds: new Set(ownedIgdbIds),
    libraryCount: Math.max(0, Number(raw.library_count) || 0),
  }
}

function fromLibrary(games) {
  const list = games || []
  return {
    recent_games: list,
    owned_igdb_ids: list.map((game) => Number(game.igdb_id)).filter(Boolean),
    library_count: list.length,
  }
}

function broadcast(days, value) {
  cacheByDays.set(days, value)
  for (const subscriber of subscribersByDays.get(days) || []) subscriber(value)
}

async function fetchBootstrap(days) {
  const recentSince = new Date(Date.now() - days * 86400000).toISOString()
  const { data, error } = await supabase.rpc('get_app_bootstrap', { recent_since: recentSince })
  if (!error) return data || {}

  // A deploy can briefly reach the browser before its migration reaches a
  // restored/preview database. Preserve the old behavior in that narrow case
  // rather than making Home unavailable.
  if (/get_app_bootstrap|schema cache|function/i.test(error.message || '')) {
    return fromLibrary(await preloadLibrary())
  }
  throw new Error(error.message || 'Home bootstrap request failed')
}

export function loadAppBootstrap(days = DEFAULT_DAYS) {
  const span = Math.max(1, Number(days) || DEFAULT_DAYS)
  if (inflightByDays.has(span)) return inflightByDays.get(span)

  const request = swr(
    `app:bootstrap:${CACHE_VERSION}:${span}`,
    () => fetchBootstrap(span),
    {
      maxAge: 0,
      onFresh: (raw) => broadcast(span, normalize(raw)),
    },
  )
    .then(({ value }) => {
      const next = normalize(value)
      if (!cacheByDays.has(span)) broadcast(span, next)
      return cacheByDays.get(span)
    })
    .finally(() => inflightByDays.delete(span))

  inflightByDays.set(span, request)
  return request
}

export function useAppBootstrap(days = DEFAULT_DAYS, enabled = true) {
  const span = Math.max(1, Number(days) || DEFAULT_DAYS)
  const cached = cacheByDays.get(span)
  const [state, setState] = useState(() => ({
    ...(cached || { games: [], ownedIds: new Set(), libraryCount: 0 }),
    loading: !cached && enabled,
    error: null,
  }))

  useEffect(() => {
    if (!enabled) return undefined
    let alive = true
    const subscribers = subscribersByDays.get(span) || new Set()
    const onValue = (value) => {
      if (alive) setState({ ...value, loading: false, error: null })
    }
    subscribers.add(onValue)
    subscribersByDays.set(span, subscribers)
    const latest = cacheByDays.get(span)
    if (latest) onValue(latest)
    loadAppBootstrap(span).catch((error) => {
      if (alive) setState((current) => ({ ...current, loading: false, error: error.message }))
    })
    return () => {
      alive = false
      subscribers.delete(onValue)
      if (!subscribers.size) subscribersByDays.delete(span)
    }
  }, [enabled, span])

  return state
}

export function getCachedLibraryCount() {
  for (const value of cacheByDays.values()) return value.libraryCount
  return null
}
