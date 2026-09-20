// Bottom-bar navigation config. There is no drawer anymore: every destination
// is either on the bar or reachable from an entry point on a tab. The nav map:
//
//   Home      - bottom bar
//   Discover  - bottom bar
//   Library   - bottom bar, with entry points to Rankings and Wishlist
//   Activity  - bottom bar, with an entry point to Insights
//   Rankings  - Library entry point (bar-eligible, off by default)
//   Insights  - Activity entry point, and Home's "Jump back in" tile
//   For You   - Home's "Jump back in" tile
//   News      - Home's top story and "More news" tile
//   Search    - detached button in the dock, stays when the bar is hidden
//   Settings  - gear in the Home header
//
// Destinations with bar: false render as tabs but the bar editor cannot place
// them on the bar; they stay reachable through their entry points above.
import { useEffect, useState } from 'react'

export const KEY = 'gamedeck_nav_v2'
const EVENT = 'gd-nav-change'

// Bar model version. Legacy drawer-era configs have no barModel: the first
// read adopts the Expo order once and the write stamps barModel: 2, so later
// reads reconcile against the user's saved bar order instead of rebuilding it.
const BAR_MODEL = 2

// Two is the fewest a bar can carry and still be a bar.
export const MIN_VISIBLE = 2

export const DEST_CATALOG = [
  { key: 'home', label: 'Home', kind: 'tab', bar: true },
  { key: 'discover', label: 'Discover', kind: 'tab', bar: true },
  { key: 'library', label: 'Library', kind: 'tab', bar: true },
  { key: 'activity', label: 'Activity', kind: 'tab', bar: true },
  { key: 'rankings', label: 'Rankings', kind: 'tab', bar: true },
  { key: 'insights', label: 'Insights', kind: 'tab', bar: false },
  { key: 'foryou', label: 'For You', kind: 'tab', bar: false },
  { key: 'news', label: 'News', kind: 'tab', bar: false },
]

export const DEST_BY_KEY = DEST_CATALOG.reduce((m, d) => ((m[d.key] = d), m), {})

// Tabs renderable by the app shell. Entry-point-only tabs (insights, foryou,
// news) are real tabs with real URLs; they just cannot be put on the bar.
export const TAB_META = DEST_CATALOG.filter((d) => d.kind === 'tab')
export const TAB_BY_KEY = TAB_META.reduce((m, t) => ((m[t.key] = t), m), {})

// Eligible for the bottom bar. This is the only predicate the bar editor and
// visibleKeys use.
export function isBarTab(key) {
  const d = DEST_BY_KEY[key]
  return Boolean(d) && d.kind === 'tab' && d.bar !== false
}

export const BAR_CATALOG = DEST_CATALOG.filter((d) => isBarTab(d.key))
export const BAR_BY_KEY = BAR_CATALOG.reduce((m, d) => ((m[d.key] = d), m), {})
const BAR_KEYS = BAR_CATALOG.map((d) => d.key)

// The approved default bar order (matches the Expo pilot). The migration below
// adopts this order for every profile; membership choices (which tabs show),
// labels, and bar visibility are still the user's and carry over.
const EXPO_BAR = ['home', 'discover', 'library', 'activity']

function defaults() {
  return {
    barModel: BAR_MODEL,
    bar: [...EXPO_BAR],
    enabled: { home: true, discover: true, library: true, activity: true, rankings: false },
    // The approved mockup shows labels under the bar icons, and the previous
    // production default was on; migrated profiles keep their saved choice.
    labels: true,
    barShown: true,
  }
}

function readStored() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// Legacy drawer-era state (order, collapsed groups) is ignored on read and
// never written back. The bar order moves to the approved Expo order; the
// user's membership choices, labels, and bar visibility carry over. A tab the
// user had on the bar before (only Rankings was ever extra) stays on the bar.
// Once a config carries barModel: 2, reads reconcile the saved bar order
// instead of rebuilding it, so the bar editor's reorder survives reloads.
function migrate(stored) {
  const base = defaults()
  if (!stored || typeof stored !== 'object') return base
  const enabled = { ...base.enabled }
  if (stored.enabled && typeof stored.enabled === 'object') {
    for (const k of BAR_KEYS) {
      if (typeof stored.enabled[k] === 'boolean') enabled[k] = stored.enabled[k]
    }
  }
  const labels = typeof stored.labels === 'boolean' ? stored.labels : base.labels
  const barShown = typeof stored.barShown === 'boolean' ? stored.barShown : base.barShown
  if (stored.barModel === BAR_MODEL && Array.isArray(stored.bar)) {
    const seen = new Set()
    const bar = []
    for (const k of stored.bar) {
      if (isBarTab(k) && !seen.has(k)) {
        seen.add(k)
        bar.push(k)
      }
    }
    for (const k of EXPO_BAR) {
      if (!seen.has(k)) bar.push(k)
    }
    return { barModel: BAR_MODEL, bar, enabled, labels, barShown }
  }
  const bar = [...EXPO_BAR]
  const hadOnBar = Array.isArray(stored.bar) ? stored.bar : []
  for (const k of BAR_KEYS) {
    if (!EXPO_BAR.includes(k) && enabled[k] && hadOnBar.includes(k)) bar.push(k)
  }
  return { barModel: BAR_MODEL, bar, enabled, labels, barShown }
}

export function getNavConfig() {
  return migrate(readStored())
}

export function setNavConfig(patch) {
  const next = { ...migrate(readStored()), ...(patch || {}) }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage full or private mode: the UI still updates for this session.
  }
  window.dispatchEvent(new Event(EVENT))
  return next
}

export function resetNavConfig() {
  const next = defaults()
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(EVENT))
  return next
}

// The tabs on the bar, in bar order. The leftmost one is also where the app
// opens, which is why App.jsx needs no landing-tab rule of its own.
export function visibleKeys(nav) {
  const cfg = nav || getNavConfig()
  return (cfg.bar || []).filter((k) => isBarTab(k) && cfg.enabled[k] !== false)
}

export function useNavConfig() {
  const [config, setConfig] = useState(() => getNavConfig())
  useEffect(() => {
    const handler = () => setConfig(getNavConfig())
    window.addEventListener(EVENT, handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener(EVENT, handler)
      window.removeEventListener('storage', handler)
    }
  }, [])
  return config
}
