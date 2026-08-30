// Shuffler selection rules: pools, filters and weighting.
//
// Deliberately separate from the component. Everything here is a pure function of
// its arguments, so the rules that decide what you are offered can be tested
// without rendering anything.
//
// The 30-day snooze list is gone along with the "Not tonight" button it served.
// Reroll already skips a pick, and a stored filter that nothing can add to but
// that still quietly removes games from the pool is worse than no filter at all.
// gamedeck_shuffle_snooze_v1 is now an orphan key; nothing reads it.
import { releaseDayDelta } from './format.js'
import { hasVibe } from './vibes.js'

// A stable identity per shuffled thing. Library rows key on master_id, wishlist
// rows on igdb_id, and the two never collide because they are prefixed.
export function shuffleId(item, mode) {
  if (!item) return null
  return mode === 'buy' ? `w:${item.igdb_id}` : `g:${item.master_id}`
}

// ------------------------------------------------------------------- the pools

// `unfinished` is the old "Anything" with the games you are done with removed. A
// picker whose job is "what should I play" must not offer something you marked
// Finished or walked away from; before this it did, and there are 38 games that
// already derive as finished from playtime alone.
export const PLAY_POOLS = [
  { key: 'never', label: 'Never played', sub: 'you have never started' },
  { key: 'barely', label: 'Barely started', sub: 'you barely started' },
  { key: 'unfinished', label: 'Anything', sub: 'you have not finished' },
  { key: 'finished', label: 'Replay', sub: 'you have already finished' },
]

export const BUY_POOLS = [
  { key: 'outnow', label: 'Out now', sub: 'on your wishlist that are out now' },
  { key: 'soon', label: 'Coming soon', sub: 'on your wishlist still to come' },
  { key: 'allw', label: 'Anything', sub: 'on your wishlist' },
]

const mins = (g) => Number(g && g.playtime_minutes) || 0

// `statusOf` is injected rather than imported so these stay pure and testable:
// the caller decides whether that means an explicit tag or a derived one.
export function inPlayPool(game, pool, statusOf) {
  const status = statusOf ? statusOf(game) : null
  if (pool === 'finished') return status === 'finished'
  // Done is done. Finished is excluded from every other pool.
  if (status === 'finished') return false
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

// How long you have got. One coarse "Under 15h" toggle could not express "I have
// an evening" or "I want something I can actually finish".
export const LENGTH_STEPS = [
  { key: 0, label: 'Any length' },
  { key: 300, label: 'Under 5h' },
  { key: 900, label: 'Under 15h' },
  { key: 2400, label: 'Under 40h' },
]

// Library rows carry ONE genre string; wishlist rows enriched from IGDB carry a
// `genres` array. Normalising here is what lets the same filter run over both.
export function gameGenres(item) {
  if (!item) return []
  if (Array.isArray(item.genres)) return item.genres
  return item.genre ? [item.genre] : []
}

export function topGenres(games, count = 6) {
  const tally = new Map()
  for (const g of games) {
    for (const key of gameGenres(g)) tally.set(key, (tally.get(key) || 0) + 1)
  }
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([genre]) => genre)
}

// A game with no genre is NOT excluded unless a genre chip is active. Same for
// length: a missing figure must never silently hide a game.
export function matchesFilters(game, f, gamePass) {
  if (!f) return true
  if (f.platform && f.platform !== 'any' && game.environment !== f.platform) return false
  if (f.genre && f.genre !== 'any' && !gameGenres(game).includes(f.genre)) return false
  if (f.vibe && f.vibe !== 'any' && !hasVibe(game, f.vibe)) return false
  if (f.maxMinutes) {
    const len = Number(game.length_minutes) || 0
    if (len > 0 && len > f.maxMinutes) return false
  }
  // A hard filter, not a nudge. "Favour Game Pass" changes the odds; this answers
  // the different question of what you can play tonight without paying for it.
  if (f.gamePassOnly) {
    if (!gamePass || !gamePass.has(Number(game.igdb_id))) return false
  }
  return true
}

// ---------------------------------------------------------------- the weighting

// Weighting, not filtering. A boosted game is likelier to come up; nothing is
// ever excluded by it, and the reason is always shown on the result.
export function weightFor(item, { mode, gamePass, boost, personalRanks }) {
  let weight = 1
  let reason = null
  if (mode === 'play' && personalRanks) {
    const score = Number(personalRanks.get(Number(item.master_id)))
    if (Number.isFinite(score)) {
      weight *= Math.max(0.8, Math.min(1.2, 1 + (score - 1500) / 750))
      if (score >= 1575) reason = 'high in your rankings'
    }
  }
  if (!boost) return { weight, reason }
  const gp = gamePass && gamePass.get(Number(item.igdb_id))
  if (!gp) return { weight, reason }
  if (mode === 'buy') {
    // The best outcome of "what should I buy" is finding out you need not buy it.
    return { weight: weight * 0.25, reason: 'Game Pass already covers it' }
  }
  if (gp.leaving_soon) return { weight: weight * 4, reason: 'leaving Game Pass soon' }
  return { weight: weight * 1.5, reason: reason || 'on Game Pass' }
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

// Everything eligible under the current question. Exported so the filter sheet
// can show live counts and never offer a combination that returns nothing.
export function eligible({ items, mode, pool, filters, gamePass, statusOf }) {
  const inPool = mode === 'buy'
    ? (it) => inBuyPool(it, pool)
    : (it) => inPlayPool(it, pool, statusOf)
  return items.filter((it) => inPool(it) && matchesFilters(it, filters, gamePass))
}

// The whole selection, end to end. Returns the pick plus everything the "why"
// line needs, so the UI never has to recompute the reasoning it displays.
export function shuffle({ items, mode, pool, filters, gamePass, personalRanks, exclude, boost, rand, statusOf }) {
  const pooled = eligible({ items, mode, pool, filters, gamePass, statusOf })
  let pickable = pooled
  if (exclude != null && pickable.length > 1) {
    const without = pickable.filter((it) => shuffleId(it, mode) !== exclude)
    if (without.length) pickable = without
  }
  if (!pickable.length) return { pick: null, poolSize: pooled.length, reason: null }

  const weighted = pickable.map((it) => weightFor(it, { mode, gamePass, boost, personalRanks }))
  const pick = weightedPick(pickable, weighted.map((w) => w.weight), rand)
  const idx = pickable.indexOf(pick)
  return {
    pick,
    poolSize: pooled.length,
    reason: idx >= 0 ? weighted[idx].reason : null,
  }
}
