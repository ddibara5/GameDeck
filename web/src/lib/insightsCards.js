// Insights cards: the catalog the user can show/hide/reorder, plus the on-device
// saved layout. Same shape as discoverRows.js on purpose - a module cache plus a
// change event - so the two surfaces behave identically and CustomizeList can
// drive either without knowing which it is holding.
import { useEffect, useState } from 'react'

const KEY = 'gamedeck_insights_cards_v1'
const EVENT = 'gd-insights-cards-change'

// Insights is recent by definition now. Lifetime snapshots were removed rather
// than left as disabled catalog clutter: a number that is the same next Tuesday
// does not earn a permanent analytics card. The four remaining cards explain a
// rolling period, where it went, what changed, and which genres are leading.
//
// Five keys left on 20 Aug 2026 (week_totals, now_playing, pace, coming_up,
// leaving_gp). The current continuation and release views moved to Home; Pace
// and the Home Game Pass card were later retired. A saved Insights layout that
// still names the old keys drops them silently on the next read.
export const CARD_CATALOG = [
  { key: 'week_chart', group: 'recent', label: 'Play overview', sub: '7- or 30-day total, chart and comparison' },
  { key: 'week_games', group: 'recent', label: 'Where your time went', sub: 'Share, progress and achievements by game' },
  { key: 'momentum', group: 'recent', label: 'Recent momentum', sub: 'Progress, rotation, finishes and longest run' },
  { key: 'genres', group: 'recent', label: 'Genres lately', sub: '90-day share of playtime by primary genre' },
]

export const CARD_BY_KEY = CARD_CATALOG.reduce((m, c) => ((m[c.key] = c), m), {})

export const GROUP_LABEL = {
  recent: 'Recent play',
}

const DEFAULT_ORDER = CARD_CATALOG.map((c) => c.key)
// Every remaining card earns a default place. Existing saved layouts keep their
// choices for the two surviving keys; the two new recent cards arrive enabled.
const DEFAULT_ENABLED = CARD_CATALOG.reduce((map, card) => ((map[card.key] = true), map), {})

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
