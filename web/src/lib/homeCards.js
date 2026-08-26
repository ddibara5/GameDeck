// Home cards: the catalog the user can show/hide/reorder on the landing screen.
//
// Same shape as insightsCards.js and discoverRows.js on purpose - a module cache
// plus a change event - so CustomizeList drives this one too without knowing
// which surface it is holding.
//
// `form` is the layout rule, and it is the only thing that differs from the
// Insights catalog: a card that is ONE FACT renders as a half-width tile, and
// consecutive tiles pair up into a row; anything with a cover, a chart or more
// than two rows takes the full width. HomeTab groups them, nothing here does.
import { useEffect, useState } from 'react'

const KEY = 'gamedeck_home_cards_v1'
const EVENT = 'gd-home-cards-change'

// Backlog, Pick up next and Pace were removed on 21 Aug 2026, not switched off:
// they were never used, and a catalog entry is a promise that the card exists.
// Their renderers, memos, state and `lib/homePicks.js` went with them, the same
// way the five cards that left Insights took theirs. A saved layout that still
// names them drops them on the next read, which is what reconcile-on-read is for.
export const CARD_CATALOG = [
  { key: 'week', form: 'tile', label: 'Recent play', sub: 'This week and change versus the prior week' },
  { key: 'now_playing', form: 'full', label: 'Now playing', sub: 'The game currently in progress' },
  { key: 'release_watch', form: 'full', label: 'Release watch', sub: 'The next arrival and latest release from your wishlist' },
  { key: 'leaving_gp', form: 'full', label: 'Game Pass', sub: 'Appears when games are leaving. Shows a status if the feed is unavailable.' },
]

export const CARD_BY_KEY = CARD_CATALOG.reduce((m, c) => ((m[c.key] = c), m), {})

// Every card in the catalog is on by default now. Pace used to be the exception,
// as a projection rather than a fact; it is gone rather than defaulted off.
const DEFAULT_ORDER = CARD_CATALOG.map((c) => c.key)
const DEFAULT_ENABLED = CARD_CATALOG.reduce((m, c) => ((m[c.key] = true), m), {})

const LEGACY_RELEASE_KEYS = ['coming_up', 'recently_released']
const LEGACY_DEFAULT_ORDER = ['now_playing', 'week', 'leaving_gp', ...LEGACY_RELEASE_KEYS]

// Merge the two retired release cards without erasing a customized layout. A
// stock legacy layout receives the new snapshot-first order; a customized one
// keeps its relative order and gets Release watch where its first release card
// used to be. The merged card stays enabled when either predecessor was enabled.
export function migrateHomeCards(stored) {
  if (!stored || !Array.isArray(stored.order)) return stored
  const hasLegacy = LEGACY_RELEASE_KEYS.some((key) => stored.order.includes(key))
  if (!hasLegacy || stored.order.includes('release_watch')) return stored

  const stockOrder = stored.order.length === LEGACY_DEFAULT_ORDER.length
    && stored.order.every((key, index) => key === LEGACY_DEFAULT_ORDER[index])
  const order = stockOrder
    ? DEFAULT_ORDER
    : stored.order.flatMap((key, index, all) => {
        if (!LEGACY_RELEASE_KEYS.includes(key)) return [key]
        return index === all.findIndex((candidate) => LEGACY_RELEASE_KEYS.includes(candidate)) ? ['release_watch'] : []
      })
  const enabled = { ...(stored.enabled || {}) }
  enabled.release_watch = LEGACY_RELEASE_KEYS.some((key) => Boolean(enabled[key]))
  for (const key of LEGACY_RELEASE_KEYS) delete enabled[key]
  return { ...stored, order, enabled }
}

function load() {
  let stored = null
  try {
    stored = migrateHomeCards(JSON.parse(localStorage.getItem(KEY) || 'null'))
  } catch {
    stored = null
  }
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
  // A card added to the catalog later arrives hidden rather than appearing
  // unannounced on a layout the user has already arranged.
  for (const k of DEFAULT_ORDER) {
    if (!seen.has(k)) order.push(k)
  }
  const enabled = {}
  for (const k of order) {
    enabled[k] = k in savedEnabled ? Boolean(savedEnabled[k]) : false
  }
  return { order, enabled }
}

export function getHomeCards() {
  return load()
}

export function setHomeCards(config) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ order: config.order, enabled: config.enabled }))
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT))
}

export function resetHomeCards() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT))
  return load()
}

export function useHomeCards() {
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
