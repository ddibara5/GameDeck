// Navigation: TWO orders, one catalog.
//
// `order` is the drawer's, grouped. `bar` is the bottom bar's, and holds only the
// destinations that are eligible for it. They were one array until 20 Aug 2026,
// which was fewer moving parts and exactly one thing wrong: you could not move
// Discover left on the bar without also moving it in the drawer. The bar is a
// shortcut, not a slice of the drawer, and the storage now says so.
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
// destination. There are exactly five bar-eligible destinations and five is what
// fits at 390px, so the ceiling is the catalog rather than a rule.
export const MIN_VISIBLE = 2

// Every destination the drawer can show, in default order.
//
// kind decides what the row does and whether it can sit in the bar:
//   tab     a top-level tab. `bar: false` marks one that is reachable only from
//           the drawer, so it never appears in the bar editor at all
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
  // Drawer only, deliberately. It is the one tab whose numbers do not change
  // between two visits on the same day, Home carries the ones that do, and
  // leaving it out of the bar editor means the five that ARE eligible fill the
  // five slots exactly. A switch that can only ever be off is not a choice.
  { key: 'insights', label: 'Insights', group: 'games', kind: 'tab', bar: false, fixed: 'drawer only', sub: 'How it is going over time' },
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

// Eligible for the bottom bar. Every bar tab is a tab; not every tab is a bar
// tab. This is the only predicate the bar editor and visibleKeys should use.
export function isBarTab(key) {
  const d = DEST_BY_KEY[key]
  return Boolean(d) && d.kind === 'tab' && d.bar !== false
}

export const BAR_CATALOG = DEST_CATALOG.filter((d) => isBarTab(d.key))
export const BAR_BY_KEY = BAR_CATALOG.reduce((m, d) => ((m[d.key] = d), m), {})

const DEFAULT_ORDER = DEST_CATALOG.map((d) => d.key)
const DEFAULT_BAR = BAR_CATALOG.map((d) => d.key)
// All five, because there are exactly five and five fit.
const DEFAULT_ENABLED = DEFAULT_BAR.reduce((m, k) => ((m[k] = true), m), {})
const DEFAULT_LABELS = true
// The bar is a shortcut, and a shortcut you can put away. Off hides the strip
// and gives the page back its full height; every destination the bar carried is
// still in the drawer, where all of them already were. Deliberately NOT modelled
// as "enabled: {} for every tab", because that would empty the bar's membership
// and lose the arrangement, trip the MIN_VISIBLE floor on the way back, and move
// the landing tab. This is a visibility flag over an untouched config.
const DEFAULT_BAR_SHOWN = true

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

  // The bar's own order, reconciled the same way. A stored array from before the
  // split simply is not there, so this falls back to the catalog order, which is
  // what the bar was already showing.
  const savedBar = (stored && Array.isArray(stored.bar) && stored.bar) || DEFAULT_BAR
  const bar = []
  const barSeen = new Set()
  for (const k of savedBar) {
    if (isBarTab(k) && !barSeen.has(k)) {
      bar.push(k)
      barSeen.add(k)
    }
  }
  for (const k of DEFAULT_BAR) {
    if (!barSeen.has(k)) bar.push(k)
  }

  // Only bar-eligible destinations carry an enabled flag. Everything else is
  // always in the drawer and can never be on the bar, so it has no state to
  // store or restore. A stored flag for a key that is no longer eligible (as
  // `insights` became on 20 Aug 2026) is ignored rather than migrated.
  const enabled = {}
  for (const k of bar) {
    enabled[k] = k in savedEnabled ? Boolean(savedEnabled[k]) : Boolean(DEFAULT_ENABLED[k])
  }

  // Safety floor: never let a saved (or corrupt) config drop below MIN_VISIBLE
  // tabs on the bar. Re-enable in bar order until the floor is met.
  let visibleCount = bar.filter((k) => enabled[k]).length
  for (const k of bar) {
    if (visibleCount >= MIN_VISIBLE) break
    if (!enabled[k]) {
      enabled[k] = true
      visibleCount += 1
    }
  }

  const labels = stored && typeof stored.labels === 'boolean' ? stored.labels : DEFAULT_LABELS
  const barShown = stored && typeof stored.barShown === 'boolean' ? stored.barShown : DEFAULT_BAR_SHOWN
  return { order, bar, enabled, labels, barShown }
}

export function getNavConfig() {
  return load()
}

export function setNavConfig(config) {
  try {
    const cur = load()
    localStorage.setItem(
      KEY,
      JSON.stringify({
        order: config.order || cur.order,
        bar: config.bar || cur.bar,
        enabled: config.enabled || cur.enabled,
        labels: typeof config.labels === 'boolean' ? config.labels : cur.labels,
        barShown: typeof config.barShown === 'boolean' ? config.barShown : cur.barShown,
      })
    )
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

// The tabs on the bar, in BAR order, which is now independent of the drawer's.
// The leftmost one is also where the app opens, which is why App.jsx needs no
// landing-tab rule of its own.
export function visibleKeys(config) {
  return (config.bar || []).filter((k) => config.enabled[k])
}

// Bar-eligible tabs the user has switched off. Still in the drawer, like
// everything else; this only marks them in the editors.
export function hiddenKeys(config) {
  return (config.bar || []).filter((k) => !config.enabled[k])
}

// True when a destination is currently reachable FROM the bar, which is what
// every "on bar" readout in the app actually claims. A hidden bar carries
// nothing, so this is false for everything while it is off, and the readouts go
// quiet instead of pointing at a strip that is not on screen. Membership itself
// is untouched and comes back exactly as it was.
export function onBar(config, key) {
  return isBarTab(key) && Boolean(config.enabled[key]) && config.barShown !== false
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
