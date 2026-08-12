// Bottom tab bar layout: which tabs show, in what order, and whether their text
// labels are visible. Mirrors the discoverRows pattern (module cache + change
// event) so the tab bar, the drawer's "More" list, and the Navigation editor all
// stay in sync without prop drilling. Hidden tabs stay reachable from the drawer.
import { useEffect, useState } from 'react'

const KEY = 'gamedeck_nav_v1'
const EVENT = 'gd-nav-change'

// At least this many tabs must stay visible in the bar, so it never collapses to
// a single (or empty) destination. The rest can be hidden into the drawer.
export const MIN_VISIBLE = 2

// The five tabs, with their display labels. Icons live in TabBar (TAB_ICONS);
// labels live here so the editor and drawer share one source of truth.
export const TAB_META = [
  { key: 'library', label: 'Library' },
  { key: 'activity', label: 'Activity' },
  { key: 'insights', label: 'Insights' },
  { key: 'discover', label: 'Discover' },
  { key: 'news', label: 'News' },
]

export const TAB_BY_KEY = TAB_META.reduce((m, t) => ((m[t.key] = t), m), {})

const DEFAULT_ORDER = TAB_META.map((t) => t.key)
const DEFAULT_LABELS = true

function load() {
  let stored = null
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    stored = null
  }

  // Start from the saved order, then reconcile against the catalog so a newly
  // added tab always appears (enabled) and any stale key drops out.
  const savedOrder = (stored && Array.isArray(stored.order) && stored.order) || DEFAULT_ORDER
  const savedEnabled = (stored && stored.enabled) || {}
  const order = []
  const seen = new Set()
  for (const k of savedOrder) {
    if (TAB_BY_KEY[k] && !seen.has(k)) {
      order.push(k)
      seen.add(k)
    }
  }
  for (const k of DEFAULT_ORDER) {
    if (!seen.has(k)) order.push(k)
  }

  const enabled = {}
  for (const k of order) {
    enabled[k] = k in savedEnabled ? Boolean(savedEnabled[k]) : true
  }

  // Safety floor: never let a saved (or corrupt) config drop below MIN_VISIBLE
  // visible tabs. Re-enable in order until the floor is met.
  let visibleCount = order.filter((k) => enabled[k]).length
  for (const k of order) {
    if (visibleCount >= MIN_VISIBLE) break
    if (!enabled[k]) {
      enabled[k] = true
      visibleCount += 1
    }
  }

  const labels = stored && typeof stored.labels === 'boolean' ? stored.labels : DEFAULT_LABELS
  return { order, enabled, labels }
}

export function getNavConfig() {
  return load()
}

export function setNavConfig(config) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ order: config.order, enabled: config.enabled, labels: config.labels }))
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT))
}

export function resetNavConfig() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT))
  return load()
}

// The tabs shown in the bar (enabled), in order.
export function visibleKeys(config) {
  return config.order.filter((k) => config.enabled[k])
}

// The tabs hidden from the bar (reachable from the drawer), in order.
export function hiddenKeys(config) {
  return config.order.filter((k) => !config.enabled[k])
}

export function useNavConfig() {
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
