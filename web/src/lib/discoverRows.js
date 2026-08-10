// Discover home rows: the catalog of shelves the user can show/hide/reorder, plus
// the on-device saved layout (order + enabled). Mirrors the theme/status pattern:
// a module cache + change event so the Discover home and the Customize editor stay
// in sync without prop drilling.
import { useEffect, useState } from 'react'

const KEY = 'gamedeck_discover_rows_v1'
const EVENT = 'gd-discover-rows-change'

// kind:
//   'wishlist'     -> the user's wishlist shelf
//   'wishlistSoon' -> wishlisted games with an upcoming release
//   'rail'         -> an IGDB rail fetched by `key` (see /api/discover?rail=)
export const ROW_CATALOG = [
  { key: 'wishlist', label: 'Your wishlist', kind: 'wishlist' },
  { key: 'popular', label: 'Popular right now', kind: 'rail' },
  { key: 'upcoming', label: 'Most anticipated', kind: 'rail' },
  { key: 'recent', label: 'Recently released', kind: 'rail' },
  { key: 'highly_rated', label: 'Critically acclaimed', kind: 'rail' },
  { key: 'coming_soon', label: 'Coming soon', sub: 'Out next, by release date', kind: 'rail' },
  { key: 'just_added', label: 'Just added', sub: 'New to the database', kind: 'rail' },
  { key: 'hidden_gems', label: 'Hidden gems', sub: 'Great, under the radar', kind: 'rail' },
  { key: 'wishlist_soon', label: 'Wishlist - coming soon', sub: 'Saved games releasing soon', kind: 'wishlistSoon' },
]

export const ROW_BY_KEY = ROW_CATALOG.reduce((m, r) => ((m[r.key] = r), m), {})

// Rail keys that need fetching from /api/discover.
export const RAIL_KEYS = ROW_CATALOG.filter((r) => r.kind === 'rail').map((r) => r.key)

const DEFAULT_ORDER = ROW_CATALOG.map((r) => r.key)
// The five original shelves are on by default; the new rows start hidden.
const DEFAULT_ENABLED = { wishlist: true, popular: true, upcoming: true, recent: true, highly_rated: true }

function load() {
  let stored = null
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    stored = null
  }
  // Start from defaults, then apply the saved layout, then reconcile against the
  // catalog so newly added rows always appear (hidden) and stale keys drop out.
  const savedOrder = (stored && Array.isArray(stored.order) && stored.order) || DEFAULT_ORDER
  const savedEnabled = (stored && stored.enabled) || DEFAULT_ENABLED
  const order = []
  const seen = new Set()
  for (const k of savedOrder) {
    if (ROW_BY_KEY[k] && !seen.has(k)) {
      order.push(k)
      seen.add(k)
    }
  }
  for (const k of DEFAULT_ORDER) {
    if (!seen.has(k)) order.push(k)
  }
  const enabled = {}
  for (const k of order) {
    enabled[k] = k in savedEnabled ? Boolean(savedEnabled[k]) : Boolean(DEFAULT_ENABLED[k])
  }
  return { order, enabled }
}

export function getRowsConfig() {
  return load()
}

export function setRowsConfig(config) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ order: config.order, enabled: config.enabled }))
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT))
}

export function resetRowsConfig() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT))
  return load()
}

export function useRowsConfig() {
  const [config, setConfig] = useState(load)
  useEffect(() => {
    const handler = () => setConfig(load())
    window.addEventListener(EVENT, handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener(EVENT, handler)
      window.removeEventListener('storage', handler)
    }
  }, [])
  return config
}
