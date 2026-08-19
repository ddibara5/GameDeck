// Insights cards: the catalog the user can show/hide/reorder, plus the on-device
// saved layout. Same shape as discoverRows.js on purpose - a module cache plus a
// change event - so the two surfaces behave identically and CustomizeList can
// drive either without knowing which it is holding.
import { useEffect, useState } from 'react'

const KEY = 'gamedeck_insights_cards_v1'
const EVENT = 'gd-insights-cards-change'

// group is presentation only: the editor prints one heading per group so the
// short-term cards do not read as a flat list with lifetime ones mixed in.
//
// The tab is a read on the last two weeks. Everything lifetime is still HERE and
// still works, it just starts hidden, because a number that is the same next
// Tuesday does not earn a place above the fold. Nothing was deleted for being
// long term; three charts were deleted for being unreadable or redundant, which
// is a different judgement and is recorded in the commit that removed them.
export const CARD_CATALOG = [
  { key: 'week_totals', group: 'short', label: 'This week', sub: 'Hours, achievements, days, games' },
  { key: 'week_chart', group: 'short', label: 'Last 7 days', sub: 'Hours per day, and the streak' },
  { key: 'week_games', group: 'short', label: 'What you played this week' },
  { key: 'now_playing', group: 'short', label: 'Now playing', sub: 'The game in progress and its arc' },
  { key: 'pace', group: 'short', label: 'Pace', sub: 'Achievements left at your current rate' },
  { key: 'coming_up', group: 'short', label: 'Coming up', sub: 'Wishlist releases with a date' },
  { key: 'leaving_gp', group: 'short', label: 'Leaving Game Pass', sub: 'Started games on the way out' },
  { key: 'lifetime', group: 'life', label: 'Lifetime totals', sub: 'Hours, achievements, median, backlog' },
  { key: 'completion', group: 'life', label: 'Completion distribution' },
  { key: 'funnel', group: 'life', label: 'Starter to Finisher' },
  { key: 'most_played', group: 'life', label: 'Most played' },
  { key: 'hall', group: 'life', label: 'Hall of fame' },
]

export const CARD_BY_KEY = CARD_CATALOG.reduce((m, c) => ((m[c.key] = c), m), {})

export const GROUP_LABEL = {
  short: 'Short term',
  life: 'Lifetime',
}

const DEFAULT_ORDER = CARD_CATALOG.map((c) => c.key)
// Short term on, lifetime off. Any card missing from this map defaults to off,
// so a card added to the catalog later arrives hidden rather than appearing
// unannounced on a layout the user has already arranged.
const DEFAULT_ENABLED = CARD_CATALOG.reduce(
  (m, c) => ((m[c.key] = c.group === 'short'), m),
  {}
)

function load() {
  let stored = null
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    stored = null
  }
  // Start from defaults, apply the saved layout, then reconcile against the
  // catalog so new cards appear and stale keys drop out.
  const savedOrder = (stored && Array.isArray(stored.order) && stored.order) || DEFAULT_ORDER
  const savedEnabled = (stored && stored.enabled) || DEFAULT_ENABLED
  const order = []
  const seen = new Set()
  for (const k of savedOrder) {
    if (CARD_BY_KEY[k] && !seen.has(k)) {
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

export function getCardsConfig() {
  return load()
}

export function setCardsConfig(config) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ order: config.order, enabled: config.enabled }))
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT))
}

export function resetCardsConfig() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT))
  return load()
}

export function useCardsConfig() {
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
