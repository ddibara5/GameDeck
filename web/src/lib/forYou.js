// For You deck, ported from the GameDeck Expo pilot (src/lib/for-you.ts).
// Builds a 12-card recommendation deck from Supabase play-history evidence
// (the get_for_you_bootstrap RPC) plus batched catalog lanes from /api/discover.
//
// Sept 10 engine port: loadForYouSnapshot() builds the deck through
// forYouEngine.js (content-based relevance + MMR diversity reranker) over a
// tasteEvidence.js profile, with discovery modes (familiar / balanced /
// adventurous), show-less/show-more taste preferences, local exposure fatigue
// and same-day slate reconciliation. loadForYouDeck() below is the original
// lane-fill algorithm, kept as the legacy path.

import { supabase } from './supabase.js'
import { authFetch } from './appAuth.js'
import { buildQuery, loadLibraryTitles, normTitle } from './discover.js'
import { idbSet, swr } from './idbCache.js'
import { buildTasteEvidenceProfile } from './tasteEvidence.js'
import {
  DEFAULT_DISCOVERY_MODE,
  DISCOVERY_MODES,
  adaptEngineProfile,
  localDay,
  selectRecommendations,
  toEngineCandidate,
} from './forYouEngine.js'
import { localDayKey } from './recommendationRotation.js'
import {
  getForYouAccount,
  readForYouState,
  saveForYouSlate,
} from './forYouStorage.js'

export const FOR_YOU_DECK_SIZE = 12
export const FOR_YOU_CANDIDATE_TTL_MS = 5 * 60 * 1000

export const defaultForYouFilters = {
  scales: ['aaa', 'aa', 'indie'],
  platforms: ['xbox', 'psn'],
  hideOwned: true,
  mode: DEFAULT_DISCOVERY_MODE,
  availability: 'all',
}

const FILTERS_KEY = 'gamedeck-for-you-filters-v1'
const DISMISSED_KEY = 'gamedeck-for-you-dismissed-v1'
const DISMISSED_CAP = 250
const COMPARISON_LIMIT = 500

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
  const mode = DISCOVERY_MODES.includes(filters.mode) ? filters.mode : DEFAULT_DISCOVERY_MODE
  const availability = filters.availability === 'released' ? 'released' : 'all'
  return `${platforms}-${scales}-${mode}-${availability}-${filters.hideOwned ? 'hide' : 'include'}`
}

// Stable snapshot identity for the deck state machine (useForYouDeck).
export function forYouFilterKey(filters) {
  return `for-you:${filterScope(filters)}`
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

function normalizeFilters(saved) {
  if (!saved || typeof saved !== 'object') return defaultForYouFilters
  const mode = DISCOVERY_MODES.includes(saved.mode) ? saved.mode : DEFAULT_DISCOVERY_MODE
  return {
    scales: Array.isArray(saved.scales) && saved.scales.length
      ? saved.scales.filter((key) => ['aaa', 'aa', 'indie'].includes(key))
      : defaultForYouFilters.scales,
    platforms: Array.isArray(saved.platforms)
      ? saved.platforms.filter((key) => ['xbox', 'psn'].includes(key))
      : defaultForYouFilters.platforms,
    hideOwned: typeof saved.hideOwned === 'boolean' ? saved.hideOwned : true,
    mode,
    availability: saved.availability === 'released' ? 'released' : 'all',
  }
}

export function loadForYouFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTERS_KEY) || 'null')
    if (!saved) return defaultForYouFilters
    return normalizeFilters(saved)
  } catch {
    return defaultForYouFilters
  }
}

export function saveForYouFilters(filters) {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(normalizeFilters(filters)))
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

async function loadComparisons() {
  try {
    const { data, error } = await supabase
      .from('rank_comparisons')
      .select('id,left_id,right_id,result,compared_at')
      .order('compared_at', { ascending: false })
      .limit(COMPARISON_LIMIT)
    if (error) return { rows: [], complete: false }
    const rows = data || []
    return { rows, complete: rows.length < COMPARISON_LIMIT }
  } catch {
    return { rows: [], complete: false }
  }
}

function catalogParams(filters, activeKeys) {
  const params = { lanes: activeKeys.join(','), limit: 20 }
  if (filters.platforms.length) params.platform = filters.platforms.join(',')
  if (filters.scales.length !== defaultForYouFilters.scales.length) {
    params.scale = filters.scales.join(',') || 'none'
  }
  return params
}

// The expensive half of a snapshot: taste profile plus the raw candidate pool.
// Cached for five minutes so filter tweaks, Why sheets and scrolling reuse the
// same pool instead of refetching the catalog.
async function fetchForYouBundle(filters, now = Date.now()) {
  if (!supabase) throw new Error('GameDeck is not configured.')

  const [bootstrapResult, ownership, comparisonResult] = await Promise.all([
    supabase.rpc('get_for_you_bootstrap'),
    loadForYouOwnershipTitles(),
    loadComparisons(),
  ])
  if (bootstrapResult.error || !bootstrapResult.data) {
    throw new Error('For You is unavailable.')
  }
  const source = bootstrapResult.data
  const games = source.games || []
  const ranks = source.ranks || []
  const activity = source.activity || []
  const comparisons = comparisonResult.rows
  const coverage = {
    games: games.length < 100,
    ranks: true,
    activity: activity.length < 500,
    comparisons: comparisonResult.complete,
  }
  const evidenceProfile = buildTasteEvidenceProfile({
    games,
    ranks,
    activity,
    comparisons,
    coverage,
    now,
  })
  const profile = adaptEngineProfile(evidenceProfile)
  const laneKeys = profile.lanes.slice(0, 4).map((lane) => lane.key)
  const activeKeys = [...laneKeys, 'new']

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  let payload
  try {
    // authFetch attaches the Supabase session's Bearer token, exactly like the
    // pilot's manual Authorization header.
    const response = await authFetch(`/api/discover?${buildQuery(catalogParams(filters, activeKeys))}`, {
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
  const dismissedIds = loadDismissedForYouGames()
  const releasedOnly = filters.availability === 'released'
  const candidates = []
  const seen = new Set()
  for (const key of activeKeys) {
    for (const raw of (payload.lanes && payload.lanes[key]) || []) {
      const parsed = parseDiscoverGame(raw)
      if (!parsed || seen.has(parsed.id)) continue
      seen.add(parsed.id)
      if (dismissedIds.has(parsed.id) || wishlistIds.has(parsed.id)) continue
      if (filters.hideOwned && ownership.has(normTitle(parsed.name))) continue
      // The lanes endpoint does not apply the status filter, so enforce the
      // released-only selection client-side.
      if (releasedOnly && !(Number(parsed.released) > 0 && parsed.released * 1000 <= now)) continue
      // Tag the candidate with the catalog lane it was served from: the IGDB
      // query behind the lane is the verified membership signal.
      candidates.push(toEngineCandidate(parsed, key))
    }
  }
  return { profile, evidenceProfile, laneKeys, activeKeys, candidates, wishlistIds, dismissedIds }
}

function bundleCacheKey(day, key) {
  return `foryou:candidates:v2:${day}:${key}`
}

async function loadForYouBundle(filters, { fresh = false, now = Date.now() } = {}) {
  const day = localDayKey(now)
  const key = forYouFilterKey(filters)
  const cacheKey = bundleCacheKey(day, key)
  const fetch = () => fetchForYouBundle(filters, now)
  if (fresh) {
    const bundle = await fetch()
    idbSet(cacheKey, bundle)
    return bundle
  }
  const { value } = await swr(cacheKey, fetch, { maxAge: FOR_YOU_CANDIDATE_TTL_MS })
  if (!value || !Array.isArray(value.candidates)) return fetch()
  return value
}

function forYouProfileKey(profile, laneKeys) {
  return [
    laneKeys.join(','),
    `sources:${profile.sources.length}`,
    profile.coverage.comparisons.complete ? 'full' : 'partial',
  ].join('|')
}

// Engine-built deck snapshot for useForYouDeck: deterministic per day, filter
// set and taste profile, reconciled against the same-day slate by game id.
// `fresh` rebuilds the taste profile and candidate pool immediately (used when
// a duel, reaction or wishlist change lands); `newBatch` additionally starts a
// new daily batch with its own seed.
export async function loadForYouSnapshot(filters, { newBatch = false, preserve, fresh = false } = {}) {
  const now = Date.now()
  const day = localDay(new Date(now))
  const key = forYouFilterKey(filters)
  const account = await getForYouAccount()
  const state = readForYouState(account)
  const slate = state.slates.find((s) => s.key === key && s.day === day)
  const batch = Math.max(0, (slate?.batch ?? 0) + (newBatch ? 1 : 0))

  const bundle = await loadForYouBundle(filters, { fresh: newBatch || fresh, now })
  const { profile, laneKeys, candidates } = bundle
  const profileKey = forYouProfileKey(profile, laneKeys)
  // Reconcile a same-day slate by stable game ID, not by numeric position.
  const preferred =
    newBatch
      ? []
      : Array.isArray(preserve) && preserve.length
        ? preserve
        : []
  const seed = `${day}:${key}:${profileKey}:b${batch}`
  const deck = selectRecommendations(candidates, profile, {
    mode: DISCOVERY_MODES.includes(filters.mode) ? filters.mode : DEFAULT_DISCOVERY_MODE,
    seed,
    now,
    exposures: state.exposures,
    less: state.less,
    more: state.more,
    exclude: new Set([...bundle.dismissedIds, ...bundle.wishlistIds]),
    preferred,
    limit: FOR_YOU_DECK_SIZE,
  })

  // A failing slate write must not fail the deck; the next load reconciles.
  try {
    await saveForYouSlate(account, {
      key,
      day,
      profile: profileKey,
      laneKeys,
      batch,
      at: now,
    })
  } catch {
    // Slate persistence is a resume optimization, not the deck itself.
  }

  return {
    key,
    day,
    profileKey,
    batch,
    deck,
    candidateCount: candidates.length,
    state: { less: state.less, more: state.more },
    laneKeys,
    evidenceProfile: bundle.evidenceProfile,
    notice: newBatch ? 'New mix ready. Your preferences still apply.' : null,
  }
}

// Legacy deck builder: fills up to 12 picks lane by lane (STRONG MATCH /
// NEW PICK). Kept for reference; ForYouTab now uses loadForYouSnapshot.
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
