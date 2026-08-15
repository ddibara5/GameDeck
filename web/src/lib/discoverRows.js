// Discover home rows: the catalog of shelves the user can show/hide/reorder, plus
// the on-device saved layout (order + enabled). Mirrors the theme/status pattern:
// a module cache + change event so the Discover home and the Customize editor stay
// in sync without prop drilling.
import { useEffect, useState } from 'react'

const KEY = 'gamedeck_discover_rows_v1'
const EVENT = 'gd-discover-rows-change'

// kind:
//   'wishlist'       -> the user's wishlist shelf
//   'wishlistSoon'   -> wishlisted games with an upcoming release
//   'wishlistOutNow' -> wishlisted games that came out in the last 30 days
//   'rail'           -> an IGDB rail fetched by `key` (see /api/discover?rail=)
//
// The two wishlist timing rows exist because the IGDB rails are DISCOVERY
// surfaces: they are filtered on hype and rating floors precisely to keep the
// daily storefront dump out. Exempting wishlisted ids from those floors would
// mean a second query per rail and would degrade what the rails are for. The
// actual gap was never "my game is missing from Coming soon" - it was that
// nothing said "a game you were waiting for is out". This row says it.
export const ROW_CATALOG = [
  { key: 'wishlist', label: 'Your wishlist', kind: 'wishlist' },
  { key: 'popular', label: 'Popular right now', kind: 'rail' },
  { key: 'upcoming', label: 'Most anticipated', kind: 'rail' },
  { key: 'recent', label: 'Recently released', kind: 'rail' },
  { key: 'highly_rated', label: 'Critically acclaimed', kind: 'rail' },
  { key: 'coming_soon', label: 'Coming soon', sub: 'Out next, by release date', kind: 'rail' },
  { key: 'just_added', label: 'Just added', sub: 'New to the database', kind: 'rail' },
  { key: 'hidden_gems', label: 'Hidden gems', sub: 'Great, under the radar', kind: 'rail' },
  { key: 'gamepass', label: 'On Game Pass', sub: 'Your Xbox subscription catalog', kind: 'gamepass' },
  { key: 'wishlist_soon', label: 'Wishlist - coming soon', sub: 'Saved games releasing soon', kind: 'wishlistSoon' },
  { key: 'wishlist_out_now', label: 'Wishlist - out now', sub: 'Games you were waiting for', kind: 'wishlistOutNow' },
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

// Which rows had something in them last time the Discover home settled.
//
// This exists so a row can hold its place in the layout WHILE its data is in
// flight, without a row that is going to turn out empty flashing a placeholder
// and then vanishing. "Wishlist - out now" is empty most weeks, so reserving
// space for it unconditionally would trade one layout shift for another.
//
// Deliberately a hint, not state: it is only ever used to decide whether to draw
// a skeleton, so a stale or missing value costs a little jitter once and nothing
// else. It is stored under the same key as the layout because it has the same
// lifetime, is the same size, and is meaningless without it.
export function getFilledRows() {
  let stored = null
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    stored = null
  }
  // No memory yet (first ever load) means every enabled row is assumed to have
  // content. That is the right default: on a first run the wishlist rows really
  // are empty, but so is everything else, so there is nothing to shift.
  if (!stored || !Array.isArray(stored.filled)) return null
  return new Set(stored.filled)
}

export function setFilledRows(keys) {
  let stored = null
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    stored = null
  }
  const next = {
    order: (stored && stored.order) || DEFAULT_ORDER,
    enabled: (stored && stored.enabled) || DEFAULT_ENABLED,
    filled: [...keys],
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable */
  }
  // Deliberately no EVENT: this is written by the Discover home itself, and
  // firing the change event would make every listener re-read the config and
  // re-render on a value none of them read.
}

export function getRowsConfig() {
  return load()
}

export function setRowsConfig(config) {
  let filled = []
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (stored && Array.isArray(stored.filled)) filled = stored.filled
  } catch {
    /* storage unavailable */
  }
  try {
    localStorage.setItem(KEY, JSON.stringify({ order: config.order, enabled: config.enabled, filled }))
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
