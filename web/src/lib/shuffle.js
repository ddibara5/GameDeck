// Shuffler selection rules: pools, filters, weighting and the snooze list.
//
// Deliberately separate from the component. Everything here is a pure function of
// its arguments (the one exception being the localStorage helpers), so the rules
// that decide what you are offered can be tested without rendering anything.
import { releaseDayDelta } from './format.js'

// Rerolls per session. High enough that it never feels like a cage; the counter
// exists so a session that has clearly stopped deciding is visible, not to stop you.
export const REROLL_BUDGET = 25

const SNOOZE_KEY = 'gamedeck_shuffle_snooze_v1'
const SNOOZE_DAYS = 30

// ---------------------------------------------------------------- snooze list

// Shape on disk: { "<id>": <epoch ms the snooze expires> }. Expired entries are
// dropped on read, so the record self-cleans and never grows without bound.
export function loadSnooze(now = Date.now()) {
  let raw = null
  try {
    raw = JSON.parse(localStorage.getItem(SNOOZE_KEY) || 'null')
  } catch {
    raw = null
  }
  const out = {}
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(raw)) {
      const until = Number(raw[k])
      if (Number.isFinite(until) && until > now) out[k] = until
    }
  }
  return out
}

export function saveSnooze(map) {
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(map))
  } catch {
    /* storage unavailable - the snooze just won't persist */
  }
}

export function addSnooze(map, id, now = Date.now()) {
  if (id == null) return map
  const next = { ...map, [String(id)]: now + SNOOZE_DAYS * 86400000 }
  saveSnooze(next)
  return next
}

export function isSnoozed(map, id) {
  return id != null && Object.prototype.hasOwnProperty.call(map, String(id))
}

// A stable identity per shuffled thing. Library rows key on master_id, wishlist
// rows on igdb_id, and the two never collide because they are prefixed.
export function shuffleId(item, mode) {
  if (!item) return null
  return mode === 'buy' ? `w:${item.igdb_id}` : `g:${item.master_id}`
}

// ------------------------------------------------------------------- the pools

export const PLAY_POOLS = [
  { key: 'never', label: 'Never played', sub: 'you have never started' },
  { key: 'barely', label: 'Barely started', sub: 'you barely started' },
  { key: 'all', label: 'Anything', sub: 'in your library' },
]

export const BUY_POOLS = [
  { key: 'outnow', label: 'Out now', sub: 'on your wishlist that are out now' },
  { key: 'soon', label: 'Coming soon', sub: 'on your wishlist still to come' },
  { key: 'allw', label: 'Anything', sub: 'on your wishlist' },
]

const mins = (g) => Number(g && g.playtime_minutes) || 0

export function inPlayPool(game, pool) {
  if (pool === 'never') return mins(game) === 0
  if (pool === 'barely') return mins(game) > 0 && mins(game) <= 120
  return true
}

export function inBuyPool(item, pool) {
  if (pool === 'allw') return true
  const d = releaseDayDelta(item && item.released)
  // No release date means we genuinely do not know which side of the line it sits
  // on, so it only ever appears under Anything. Guessing would put unreleased
  // games in "Out now", which is the one thing this pool must never do.
  if (d === null) return false
  return pool === 'outnow' ? d <= 0 : d > 0
}

// ----------------------------------------------------------------- the filters

// Curated keyword chips. `games.genre` holds a single IGDB genre, so Dark Souls
// and Persona are both "Role-playing (RPG)"; these come from the keywords column
// instead, which is the only place a soulslike is distinguishable from an RPG.
// Each entry lists every spelling IGDB uses, since it is not consistent.
export const VIBES = [
  { key: 'soulslike', label: 'Soulslike', terms: ['souls-like', 'soulslike'] },
  { key: 'openworld', label: 'Open world', terms: ['open world'] },
  { key: 'stealth', label: 'Stealth', terms: ['stealth'] },
  { key: 'postapoc', label: 'Post-apocalyptic', terms: ['post-apocalyptic'] },
  { key: 'horror', label: 'Horror', terms: ['horror', 'survival horror'] },
  { key: 'story', label: 'Story rich', terms: ['story rich'] },
]

export function hasVibe(game, vibeKey) {
  const v = VIBES.find((x) => x.key === vibeKey)
  if (!v) return true
  const kw = (game && game.keywords) || []
  return v.terms.some((t) => kw.indexOf(t) >= 0)
}

// Only offer a chip that can actually return something. A filter that always
// yields an empty rail is worse than no filter at all.
export function availableVibes(games, min = 5) {
  return VIBES.filter((v) => games.filter((g) => hasVibe(g, v.key)).length >= min)
}

export function topGenres(games, count = 6) {
  const tally = new Map()
  for (const g of games) {
    const key = g && g.genre
    if (key) tally.set(key, (tally.get(key) || 0) + 1)
  }
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([genre]) => genre)
}

// A game with no genre is NOT excluded unless a genre chip is active. Same for
// length: a missing figure must never silently hide a game.
export function matchesFilters(game, f) {
  if (f.platform && f.platform !== 'any' && game.environment !== f.platform) return false
  if (f.genre && f.genre !== 'any' && game.genre !== f.genre) return false
  if (f.vibe && f.vibe !== 'any' && !hasVibe(game, f.vibe)) return false
  if (f.maxMinutes) {
    const len = Number(game.length_minutes) || 0
    if (len > 0 && len > f.maxMinutes) return false
  }
  return true
}

// ---------------------------------------------------------------- the weighting

// Weighting, not filtering. A boosted game is likelier to come up; nothing is
// ever excluded by it, and the reason is always shown on the result.
export function weightFor(item, { mode, gamePass, boost }) {
  if (!boost) return { weight: 1, reason: null }
  const gp = gamePass && gamePass.get(Number(item.igdb_id))
  if (!gp) return { weight: 1, reason: null }
  if (mode === 'buy') {
    // The best outcome of "what should I buy" is finding out you need not buy it.
    return { weight: 0.25, reason: 'Game Pass already covers it' }
  }
  if (gp.leaving_soon) return { weight: 4, reason: 'leaving Game Pass soon' }
  return { weight: 1.5, reason: 'on Game Pass' }
}

// `rand` is injectable so the distribution can be tested deterministically.
export function weightedPick(list, weights, rand = Math.random) {
  if (!list.length) return null
  let total = 0
  for (let i = 0; i < list.length; i++) total += weights[i]
  if (!(total > 0)) return list[Math.floor(rand() * list.length)]
  let r = rand() * total
  for (let i = 0; i < list.length; i++) {
    r -= weights[i]
    if (r <= 0) return list[i]
  }
  return list[list.length - 1]
}

// The whole selection, end to end. Returns the pick plus everything the "why"
// line needs, so the UI never has to recompute the reasoning it displays.
export function shuffle({ items, mode, pool, filters, gamePass, snoozeMap, exclude, boost, rand }) {
  const inPool = mode === 'buy' ? inBuyPool : inPlayPool
  const eligible = items.filter(
    (it) => inPool(it, pool) && (mode === 'buy' || matchesFilters(it, filters)) &&
      (mode !== 'buy' || !filters.vibe || filters.vibe === 'any')
  )
  const fresh = eligible.filter((it) => !isSnoozed(snoozeMap, shuffleId(it, mode)))
  // Falling back to the snoozed set beats showing nothing: an empty result reads
  // as a broken feature, and the snooze is a preference rather than a hard rule.
  let pickable = fresh.length ? fresh : eligible
  if (exclude != null && pickable.length > 1) {
    const without = pickable.filter((it) => shuffleId(it, mode) !== exclude)
    if (without.length) pickable = without
  }
  if (!pickable.length) return { pick: null, poolSize: eligible.length, reason: null }

  const weighted = pickable.map((it) => weightFor(it, { mode, gamePass, boost }))
  const pick = weightedPick(pickable, weighted.map((w) => w.weight), rand)
  const idx = pickable.indexOf(pick)
  return {
    pick,
    poolSize: eligible.length,
    reason: idx >= 0 ? weighted[idx].reason : null,
    usedSnoozed: !fresh.length && eligible.length > 0,
  }
}
