// Navigation: one ordered list of destinations that drives BOTH the drawer and
// the bottom tab bar.
//
// It used to be a tab-bar-only config, with the drawer holding a hand-written
// Lists section plus a "More" list of whatever the bar was hiding. That meant the
// drawer's contents changed shape depending on a setting made weeks ago, and half
// the app's destinations were reachable from only one of the two surfaces.
//
// Now the drawer lists everything, grouped, and the bar is a shortcut into it:
// `enabled` marks which tabs are on the bar, and the bar renders them in the
// order they appear here. One order, one editor (CustomizeNav), no second model
// to keep in sync.
//
// Storage moved to _v2 deliberately rather than migrating _v1: the old array has
// no `home` key, and reconcile-on-read would have appended Home to the END with
// enabled=true, which both lands the app on Library and puts six tabs in the bar.
// A new key means one clean default, and _v1 is simply ignored.
import { useEffect, useState } from 'react'

const KEY = 'gamedeck_nav_v2'
const EVENT = 'gd-nav-change'

// At least this many tabs stay on the bar, so it never collapses to a single
// destination. Five is what fits at 390px without the labels colliding; nothing
// enforces that ceiling, because silently dropping a tab the user just switched
// on is worse than a slightly tight bar.
export const MIN_VISIBLE = 2
export const BAR_COMFORTABLE = 5

// Every destination the drawer can show, in default order.
//
// kind decides what the row does and whether it can sit in the bar:
//   tab     a top-level tab; the editor's switch puts it on the bar
//   view    opens a full-page overlay (Wishlist)
//   list    opens a drawer list view, by viewKey
//   action  opens a sheet (Settings)
//
// group is presentation: the drawer and the editor both print a heading when the
// group changes as the list is walked, so a row dragged elsewhere takes its
// heading with it instead of the order being reshuffled to suit the headings.
export const DEST_CATALOG = [
  { key: 'home', label: 'Home', group: 'games', kind: 'tab', sub: 'The landing screen' },
  { key: 'library', label: 'Library', group: 'games', kind: 'tab' },
  { key: 'activity', label: 'Activity', group: 'games', kind: 'tab' },
  { key: 'insights', label: 'Insights', group: 'games', kind: 'tab', sub: 'How it is going over time' },
  { key: 'discover', label: 'Discover', group: 'explore', kind: 'tab' },
  { key: 'news', label: 'News', group: 'explore', kind: 'tab' },
  { key: 'wishlist', label: 'Wishlist', group: 'explore', kind: 'view', fixed: 'list' },
  { key: 'backlog', label: 'Backlog', group: 'shelves', kind: 'list', viewKey: 'status:backlog', fixed: 'shelf' },
  { key: 'playing', label: 'Playing', group: 'shelves', kind: 'list', viewKey: 'status:playing', fixed: 'shelf' },
  { key: 'finished', label: 'Finished', group: 'shelves', kind: 'list', viewKey: 'status:finished', fixed: 'shelf' },
  { key: 'abandoned', label: 'Abandoned', group: 'shelves', kind: 'list', viewKey: 'status:abandoned', fixed: 'shelf' },
  { key: 'settings', label: 'Settings', group: 'app', kind: 'action', fixed: ' ' },
]

export const DEST_BY_KEY = DEST_CATALOG.reduce((m, d) => ((m[d.key] = d), m), {})

export const GROUP_LABEL = {
  games: 'Your games',
  explore: 'Explore',
  shelves: 'Shelves',
  app: 'App',
}

// Tabs only, for the tab bar and its icons.
export const TAB_META = DEST_CATALOG.filter((d) => d.kind === 'tab')
export const TAB_BY_KEY = TAB_META.reduce((m, t) => ((m[t.key] = t), m), {})

export function isTab(key) {
  return DEST_BY_KEY[key] ? DEST_BY_KEY[key].kind === 'tab' : false
}

const DEFAULT_ORDER = DEST_CATALOG.map((d) => d.key)
// Insights starts off the bar: it is the one tab whose numbers do not change
// between two visits on the same day, and Home now carries the ones that do. It
// is one switch away, and it is in the drawer either way.
const DEFAULT_ENABLED = { home: true, library: true, activity: true, discover: true, news: true, insights: false }
const DEFAULT_LABELS = true

function load() {
  let stored = null
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    stored = null
  }

  // Saved order first, then reconcile against the catalog so a destination added
  // later appears and a stale key drops out.
  const savedOrder = (stored && Array.isArray(stored.order) && stored.order) || DEFAULT_ORDER
  const savedEnabled = (stored && stored.enabled) || {}
  const order = []
  const seen = new Set()
  for (const k of savedOrder) {
    if (DEST_BY_KEY[k] && !seen.has(k)) {
      order.push(k)
      seen.add(k)
    }
  }
  for (const k of DEFAULT_ORDER) {
    if (!seen.has(k)) order.push(k)
  }

  // Only tabs carry an enabled flag. Everything else is always in the drawer and
  // can never be on the bar, so it has no state to store or restore.
  const enabled = {}
  for (const k of order) {
    if (!isTab(k)) continue
    enabled[k] = k in savedEnabled ? Boolean(savedEnabled[k]) : Boolean(DEFAULT_ENABLED[k])
  }

  // Safety floor: never let a saved (or corrupt) config drop below MIN_VISIBLE
  // tabs on the bar. Re-enable in order until the floor is met.
  let visibleCount = order.filter((k) => isTab(k) && enabled[k]).length
  for (const k of order) {
    if (visibleCount >= MIN_VISIBLE) break
    if (isTab(k) && !enabled[k]) {
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

// The tabs on the bar, in drawer order. The leftmost one is also where the app
// opens, which is why Home sits first in the default order rather than App.jsx
// naming a landing tab of its own.
export function visibleKeys(config) {
  return config.order.filter((k) => isTab(k) && config.enabled[k])
}

// Tabs kept off the bar. They are still in the drawer like everything else; this
// is only used to mark them in the editor.
export function hiddenKeys(config) {
  return config.order.filter((k) => isTab(k) && !config.enabled[k])
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
