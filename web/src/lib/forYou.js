// For You deck, ported from the GameDeck Expo pilot (src/lib/for-you.ts).
// Builds a 12-card recommendation deck from Supabase play-history evidence
// (the get_for_you_bootstrap RPC) plus batched catalog lanes from /api/discover.

import { supabase } from './supabase.js'
import { authFetch } from './appAuth.js'
import { buildQuery, loadLibraryTitles, normTitle } from './discover.js'

export const FOR_YOU_DECK_SIZE = 12

export const defaultForYouFilters = {
  scales: ['aaa', 'aa', 'indie'],
  platforms: ['xbox', 'psn'],
  hideOwned: true,
}

const FILTERS_KEY = 'gamedeck-for-you-filters-v1'
const DISMISSED_KEY = 'gamedeck-for-you-dismissed-v1'
const DISMISSED_CAP = 250

const catalogLanes = [
  { key: 'soulslike', label: 'Soulslike', terms: ['soulslike', 'souls-like'] },
  { key: 'openworld', label: 'Open world', terms: ['open world'] },
  { key: 'survival', label: 'Survival', terms: ['survival'] },
  { key: 'story', label: 'Story rich', terms: ['story rich'] },
  { key: 'postapoc', label: 'Post-apocalyptic', terms: ['post-apocalyptic'] },
  { key: 'horror', label: 'Horror', terms: ['horror', 'survival horror'] },
  { key: 'jrpg', label: 'JRPG', terms: ['jrpg'] },
  { key: 'stealth', label: 'Stealth', terms: ['stealth'] },
  { key: 'metroidvania', label: 'Metroidvania', terms: ['metroidvania'] },
]

// Decks are keyed by day and by filter selection so a resumed position is only
// ever applied to the same deck it was saved from.
function filterScope(filters) {
  const platforms = filters.platforms.length ? filters.platforms.join('-') : 'all'
  const scales = filters.scales.length === defaultForYouFilters.scales.length
    ? 'all'
    : filters.scales.join('-') || 'none'
  return `${platforms}-${scales}-${filters.hideOwned ? 'hide' : 'include'}`
}

function keyForToday(filters) {
  return `gamedeck-for-you-${new Date().toISOString().slice(0, 10)}-${filterScope(filters)}`
}

function matchesLane(game, lane) {
  const keywords = game.keywords || []
  return lane.terms.some((term) =>
    keywords.some((keyword) => String(keyword).toLowerCase().includes(term))
  )
}

function reasonFor(lane) {
  if (!lane) return 'New on your platforms'
  if (lane.reaction === 'loved') return `Because you loved ${lane.exemplar}`
  if (lane.reaction === 'liked') return `Because you liked ${lane.exemplar}`
  return `${lane.label}, like ${lane.exemplar}`
}

function activeTasteLanes(games, ranks) {
  const ranksByGame = new Map(
    ranks
      .filter((rank) => typeof rank.master_id === 'string')
      .map((rank) => [rank.master_id, rank])
  )

  return catalogLanes
    .map((lane) => {
      const matches = games.filter((game) => matchesLane(game, lane))
      // The Swift pilot also requires two matching games before a keyword can
      // become a personal lane, so a single title cannot overfit the deck.
      if (matches.length < 2) return null

      const ranked = matches
        .map((game) => {
          const rank = ranksByGame.get(game.master_id || '')
          const playtime = Math.max(0, game.playtime_minutes || 0)
          const contribution =
            Math.log1p(playtime) +
            Math.max(0, (rank && typeof rank.score === 'number' ? rank.score : 1500) - 1400) / 100 +
            Math.min(2, Math.max(0, rank?.comparison_count || 0) / 4)
          return { game, rank, contribution }
        })
        .sort((left, right) => right.contribution - left.contribution)
      const best = ranked[0]
      if (!best || !best.game.title || best.contribution <= 0) return null
      return {
        ...lane,
        exemplar: best.game.title,
        reaction: best.rank ? best.rank.reaction || null : null,
        strength: ranked.reduce((total, item) => total + item.contribution, 0),
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.strength - left.strength)
    .slice(0, 4)
}

// The /api/discover payload is already in the web normalized shape; this only
// guards the deck against malformed rows (nulls, missing id/name) while
// keeping every field the detail sheet and card render from.
function parseDiscoverGame(raw) {
  const id = Number(raw && raw.id)
  if (!Number.isSafeInteger(id) || id <= 0) return null
  const name = String(raw.name || '').trim()
  if (!name) return null
  return {
    ...raw,
    id,
    name,
    cover: typeof raw.cover === 'string' && raw.cover ? raw.cover : null,
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    year: typeof raw.year === 'number' ? raw.year : null,
    platforms: Array.isArray(raw.platforms) ? raw.platforms.filter(Boolean) : [],
    releaseLabel: raw.release && raw.release.label ? String(raw.release.label) : null,
  }
}

export function loadForYouFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTERS_KEY) || 'null')
    if (!saved || typeof saved !== 'object') return defaultForYouFilters
    return {
      scales: Array.isArray(saved.scales) && saved.scales.length
        ? saved.scales.filter((key) => ['aaa', 'aa', 'indie'].includes(key))
        : defaultForYouFilters.scales,
      platforms: Array.isArray(saved.platforms)
        ? saved.platforms.filter((key) => ['xbox', 'psn'].includes(key))
        : defaultForYouFilters.platforms,
      hideOwned: typeof saved.hideOwned === 'boolean' ? saved.hideOwned : true,
    }
  } catch {
    return defaultForYouFilters
  }
}

export function saveForYouFilters(filters) {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters))
  } catch {
    // Disk failure keeps the deck usable with in-memory filters.
  }
}

export function loadDismissedForYouGames() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISSED_KEY) || 'null')
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((id) => Number.isSafeInteger(id) && id > 0)
        : []
    )
  } catch {
    return new Set()
  }
}

export function dismissForYouGame(id) {
  if (!Number.isSafeInteger(id) || id <= 0) return
  const dismissed = loadDismissedForYouGames()
  dismissed.add(id)
  // Intentionally bounded: this is a preference, not an unbounded local catalog.
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed].slice(-DISMISSED_CAP)))
  } catch {
    // A failed persist still applies to this session's deck.
  }
}

export function loadDailyDeckIndex(count, filters) {
  const saved = Number(localStorage.getItem(keyForToday(filters)))
  return Number.isSafeInteger(saved) && saved >= 0 && saved < count ? saved : 0
}

export function saveDailyDeckIndex(index, filters) {
  try {
    localStorage.setItem(keyForToday(filters), String(index))
  } catch {
    // Losing the resume position never breaks the deck itself.
  }
}

// The ownership titles, kept separate from the deck so tests and the detail
// sheet can reuse the same set.
export async function loadForYouOwnershipTitles() {
  try {
    return await loadLibraryTitles()
  } catch {
    return new Set()
  }
}

export async function loadForYouDeck(filters = defaultForYouFilters) {
  if (!supabase) throw new Error('GameDeck is not configured.')

  const [bootstrapResult, ownership, dismissed] = await Promise.all([
    supabase.rpc('get_for_you_bootstrap'),
    loadForYouOwnershipTitles(),
    Promise.resolve(loadDismissedForYouGames()),
  ])
  if (bootstrapResult.error || !bootstrapResult.data) {
    throw new Error('For You is unavailable.')
  }

  const source = bootstrapResult.data
  const choices = activeTasteLanes(source.games || [], source.ranks || [])
  const activeKeys = [...choices.map((lane) => lane.key), 'new']

  const params = { lanes: activeKeys.join(','), limit: FOR_YOU_DECK_SIZE * 2 }
  if (filters.platforms.length) params.platform = filters.platforms.join(',')
  if (filters.scales.length !== defaultForYouFilters.scales.length) {
    params.scale = filters.scales.join(',') || 'none'
  }

  // authFetch attaches the Supabase session's Bearer token, exactly like the
  // pilot's manual Authorization header.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  let payload
  try {
    const response = await authFetch(`/api/discover?${buildQuery(params)}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error('For You catalog is unavailable.')
    payload = await response.json()
  } finally {
    clearTimeout(timeout)
  }

  const wishlistIds = new Set(
    (source.wishlist || [])
      .map((row) => row && row.igdb_id)
      .filter((id) => typeof id === 'number' && id > 0)
  )

  const result = []
  const seen = new Set()
  for (const key of activeKeys) {
    const lane = choices.find((choice) => choice.key === key)
    const candidates = (payload.lanes && payload.lanes[key]) || []
    for (const raw of candidates) {
      const game = parseDiscoverGame(raw)
      if (!game) continue
      if (
        result.length >= FOR_YOU_DECK_SIZE ||
        seen.has(game.id) ||
        dismissed.has(game.id) ||
        wishlistIds.has(game.id) ||
        (filters.hideOwned && ownership.has(normTitle(game.name)))
      ) {
        continue
      }
      seen.add(game.id)
      result.push({
        game,
        kind: lane ? 'STRONG MATCH' : 'NEW PICK',
        reason: reasonFor(lane),
      })
    }
  }
  return result
}
