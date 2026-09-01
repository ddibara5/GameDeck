// Pure personalization helpers for the For You feed. Kept separate from the
// Supabase-backed hook so the recommendation rules can be tested without a
// browser or network client.

export const LANE_CATALOG = [
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

export const NEW_LANE = { key: 'new', label: 'New on your platforms' }
export const MAX_TASTE_LANES = 4

const GENRE_LABELS = new Map([
  ['role-playing (rpg)', 'RPG'],
  ["hack and slash/beat 'em up", 'Hack & slash'],
  ['hack and slash/beat ’em up', 'Hack & slash'],
  ['real time strategy (rts)', 'RTS'],
  ['turn-based strategy (tbs)', 'Turn-based strategy'],
  ['point-and-click', 'Point & click'],
  ['card & board game', 'Card/Board'],
  ['simulator', 'Simulation'],
  ['platform', 'Platformer'],
])

const VIBE_TERMS = [
  ['soulslike', 'Soulslike'],
  ['souls-like', 'Soulslike'],
  ['turn-based combat', 'Turn-based'],
  ['turn-based', 'Turn-based'],
  ['open world', 'Open world'],
  ['post-apocalyptic', 'Post-apocalyptic'],
  ['story rich', 'Story rich'],
  ['survival horror', 'Horror'],
  ['survival', 'Survival'],
  ['horror', 'Horror'],
  ['stealth', 'Stealth'],
  ['science fiction', 'Sci-fi'],
  ['fantasy', 'Fantasy'],
  ['metroidvania', 'Metroidvania'],
  ['jrpg', 'JRPG'],
  ['mystery', 'Mystery'],
  ['thriller', 'Thriller'],
  ['historical', 'Historical'],
  ['warfare', 'Warfare'],
]

const DAY_MS = 24 * 60 * 60 * 1000
const RECENCY_HALF_LIFE_DAYS = 120
export const RECOMMENDATION_SLATE_SIZE = 12
export const RECOMMENDATION_STRONG_COUNT = 7
export const RECOMMENDATION_ADJACENT_COUNT = 3
export const RECOMMENDATION_WILDCARD_COUNT = 2

function clamp(min, max, value) {
  return Math.max(min, Math.min(max, value))
}

function feedbackAt(feedback, key) {
  if (!feedback) return null
  if (typeof feedback.get === 'function') {
    return feedback.get(key) || feedback.get(Number(key)) || feedback.get(String(key)) || null
  }
  return feedback[key] || feedback[String(key)] || null
}

// Outcome evidence is deliberately a secondary correction. Five impressions are
// required before a lane moves at all, sparse samples are shrunk toward neutral,
// and even mature evidence can only adjust the lane by ten percent.
export function laneOutcomeMultiplier(feedback) {
  const exposures = Math.max(0, Number(feedback?.exposure_count) || 0)
  if (exposures < 5) return 1
  const detailRate = Math.min(exposures, Math.max(0, Number(feedback?.detail_open_count) || 0)) / exposures
  const meaningfulRate = Math.min(exposures, Math.max(0, Number(feedback?.meaningful_outcome_count) || 0)) / exposures
  const signal = detailRate * 0.35 + meaningfulRate * 0.65
  const confidence = clamp(0, 1, (exposures - 4) / 16)
  return clamp(0.9, 1.1, 1 + (signal - 0.08) * 0.35 * confidence)
}

// Per-game feedback mostly prevents stale repetition. A detail open is a weak
// positive; wishlist/ownership/play/ranking evidence is stronger but still
// smaller than the existing freshness, quality and explicit-wishlist signals.
export function candidateOutcomeAdjustment(feedback) {
  const exposures = Math.max(0, Number(feedback?.exposure_count) || 0)
  const details = Math.max(0, Number(feedback?.detail_open_count) || 0)
  const meaningful = Math.max(0, Number(feedback?.meaningful_outcome_count) || 0)
  const ignored = Number.isFinite(Number(feedback?.ignored_streak))
    ? Math.max(0, Number(feedback.ignored_streak))
    : exposures
  if (meaningful > 0) return Math.min(0.08, 0.04 + meaningful * 0.015)
  if (details > 0) return Math.min(0.04, details * 0.015)
  if (ignored < 3) return 0
  return -Math.min(0.12, (ignored - 2) * 0.035)
}

// Silence is ambiguous, so it never permanently removes a game. Three
// consecutive ignored opportunities start a short rest; repeat ignores extend
// it, capped at 30 days so a genuinely strong recommendation can return.
export function candidateCooldownDays(feedback) {
  const ignored = Math.max(0, Number(feedback?.ignored_streak) || 0)
  if (ignored < 3) return 0
  if (ignored === 3) return 7
  if (ignored === 4) return 14
  return 30
}

export function candidateIsCoolingDown(feedback, now = Date.now()) {
  const days = candidateCooldownDays(feedback)
  if (!days) return false
  const lastShown = Date.parse(feedback?.last_shown_at || '')
  if (!Number.isFinite(lastShown)) return false
  return now < lastShown + days * DAY_MS
}

// Reactions are the user's explicit opinion. Elo refines that opinion once
// comparisons exist, and comparison_count controls how strongly that refinement
// is trusted. An un-compared reaction still matters; an early Elo number does
// not get to dominate a taste profile.
export function rankingWeight(rank) {
  if (!rank) return 1
  if (rank.reaction === 'not_for_me') return 0

  const reactionWeight = {
    loved: 1.3,
    liked: 1.12,
    mixed: 0.68,
  }[rank.reaction] || 1
  const comparisons = Math.max(0, Number(rank.comparison_count) || 0)
  const confidence = clamp(0, 1, comparisons / 6)
  const elo = clamp(0.75, 1.25, 1 + ((Number(rank.score) || 1500) - 1500) / 600)
  return clamp(0.45, 1.5, reactionWeight * (1 + (elo - 1) * confidence))
}

export function tasteContribution(row, now = Date.now()) {
  const lifetimeMinutes = Math.max(0, Number(row?.playtime_minutes) || 0)
  const recentMinutes = Math.max(0, Number(row?.recent_minutes) || 0)
  if (!lifetimeMinutes && !recentMinutes) return 0
  const playedAt = Date.parse(row?.recent_last_played || row?.last_played || '')
  const daysAgo = Number.isFinite(playedAt) ? Math.max(0, (now - playedAt) / DAY_MS) : RECENCY_HALF_LIFE_DAYS
  const recency = clamp(0.3, 1, 0.5 ** (daysAgo / RECENCY_HALF_LIFE_DAYS))
  // The activity window is the strongest behavioral signal. Lifetime play is a
  // quieter prior, so an old 200-hour game cannot drown out what is happening
  // now. Log scaling still keeps either source from becoming a monopoly.
  const recentStrength = Math.log1p(recentMinutes / 60) * 1.25
  const lifetimeStrength = Math.log1p(lifetimeMinutes / 60) * (recentMinutes ? 0.22 : 0.32)
  const playStrength = recentStrength + lifetimeStrength
  return playStrength * recency * rankingWeight(row?.personalRank)
}

export function rankLanes(rows, now = Date.now(), { laneFeedback } = {}) {
  const out = []
  for (const lane of LANE_CATALOG) {
    let strength = 0
    let count = 0
    let rankedEvidence = 0
    let exemplar = null
    for (const row of rows || []) {
      const keywords = (row && row.keywords) || []
      if (!lane.terms.some((term) => keywords.includes(term))) continue
      const contribution = tasteContribution(row, now)
      if (contribution <= 0) continue
      count += 1
      strength += contribution
      if (row.personalRank) rankedEvidence += 1
      if (!exemplar || contribution > exemplar.contribution) {
        exemplar = {
          title: row.title,
          reaction: row.personalRank?.reaction || null,
          contribution,
        }
      }
    }
    if (count >= 2) {
      const outcomeMultiplier = laneOutcomeMultiplier(feedbackAt(laneFeedback, lane.key))
      out.push({
        ...lane,
        strength: strength * outcomeMultiplier,
        outcomeMultiplier,
        count,
        rankedEvidence,
        exemplar: exemplar?.title || null,
        exemplarReaction: exemplar?.reaction || null,
      })
    }
  }
  out.sort((a, b) => b.strength - a.strength)
  return out.slice(0, MAX_TASTE_LANES)
}

export function laneReason(lane) {
  if (!lane) return ''
  if (lane.key === 'new') return NEW_LANE.label
  if (lane.exemplar && lane.exemplarReaction === 'loved') return `Because you loved ${lane.exemplar}`
  if (lane.exemplar && lane.exemplarReaction === 'liked') return `Because you liked ${lane.exemplar}`
  return lane.exemplar ? `${lane.label}, like ${lane.exemplar}` : lane.label
}

function compactGenre(value) {
  const label = String(value || '').trim()
  return GENRE_LABELS.get(label.toLowerCase()) || label
}

function metadataVibe(game) {
  const values = [...(game?.themes || []), ...(game?.keywords || [])]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
  for (const [term, label] of VIBE_TERMS) {
    if (values.some((value) => value === term || value.includes(term))) return label
  }
  return ''
}

// A single scan line for the compact For You feed. The personalized lane is a
// stronger, verified description than a generic theme (a soulslike lane only
// contains games that matched that IGDB query), while the New lane falls back
// to the game's own themes and curated keywords. Never invent a label when the
// catalog has no useful signal.
export function gameDescriptor(game) {
  const genre = (game?.genres || [])
    .map(compactGenre)
    .find((label) => label && label.toLowerCase() !== 'indie') || ''
  const laneVibe = game?.lane?.key && game.lane.key !== NEW_LANE.key
    ? String(game.lane.label || '').trim()
    : ''
  const vibe = laneVibe || metadataVibe(game)
  if (!genre) return vibe
  if (!vibe || genre.toLowerCase() === vibe.toLowerCase()) return genre
  return `${genre} · ${vibe}`
}

function candidateScore(game, now, gameFeedback) {
  const rating = Number(game?.rating)
  const votes = Math.max(0, Number(game?.ratingCount) || 0)
  const confidence = votes / (votes + 25)
  const quality = Number.isFinite(rating) ? confidence * (rating / 100) + (1 - confidence) * 0.72 : 0.72
  const releasedAt = Number(game?.released) * 1000
  const daysAgo = Number.isFinite(releasedAt) && releasedAt > 0 ? Math.max(0, (now - releasedAt) / DAY_MS) : 1095
  const freshness = 1 - clamp(0, 1, daysAgo / 1095)
  return freshness * 0.58
    + quality * 0.42
    + candidateOutcomeAdjustment(feedbackAt(gameFeedback, game?.id))
}

export function rankCandidates(games, now = Date.now(), { gameFeedback } = {}) {
  return (games || [])
    .map((game, index) => {
      return { game, index, score: candidateScore(game, now, gameFeedback) }
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ game }) => game)
}

function idSetHas(ids, value) {
  return Boolean(ids) && (
    ids.has(value)
    || ids.has(Number(value))
    || ids.has(String(value))
  )
}

function gameTraits(game) {
  return new Set([...(game?.genres || []), ...(game?.themes || []), ...(game?.keywords || [])]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean))
}

function sharesTrait(game, selected) {
  const traits = gameTraits(game)
  if (!traits.size) return false
  return selected.some((pick) => {
    const pickedTraits = gameTraits(pick)
    for (const trait of traits) if (pickedTraits.has(trait)) return true
    return false
  })
}

function similarityCount(game, selected) {
  const traits = gameTraits(game)
  let matches = 0
  for (const pick of selected) {
    const pickedTraits = gameTraits(pick)
    for (const trait of traits) if (pickedTraits.has(trait)) matches += 1
  }
  return matches
}

function candidateEligible(game, now, {
  wishlistIds,
  dismissedIds,
  excludedIds,
  gameFeedback,
  drop,
  allowRotation = false,
} = {}) {
  if (!game || (drop && drop(game))) return false
  if (idSetHas(wishlistIds, game.id) || idSetHas(dismissedIds, game.id)) return false
  if (!allowRotation && idSetHas(excludedIds, game.id)) return false
  return !candidateIsCoolingDown(feedbackAt(gameFeedback, game.id), now)
}

function addUnique(target, candidates, limit) {
  const seen = new Set(target.map((game) => String(game.id)))
  for (const game of candidates) {
    if (target.length >= limit) break
    const key = String(game.id)
    if (seen.has(key)) continue
    seen.add(key)
    target.push(game)
  }
}

function withKind(games, recommendationKind) {
  return games.map((game) => ({ ...game, recommendationKind }))
}

function rankedEligibleByLane(lanes, byLane, now, options, allowRotation = false) {
  const out = {}
  for (const lane of lanes) {
    out[lane.key] = rankCandidates(byLane[lane.key] || [], now, options)
      .filter((game) => candidateEligible(game, now, { ...options, allowRotation }))
  }
  return out
}

// Compose one recommendation batch after relevance ranking. The default blend
// keeps seven high-confidence taste matches, three nearby discoveries from New,
// and two less-similar wildcards. Continuation batches can provide their own
// smaller mix through options. Daily exclusions are strict when alternatives
// exist; at most two prior picks may return at the end when the candidate pool
// is unusually small. Cooldowns, wishlist items and explicit dismissals are
// never relaxed.
export function buildRecommendationSlate(lanes, byLane, now = Date.now(), options = {}) {
  const activeLanes = (lanes || []).filter(Boolean)
  if (!activeLanes.length) return []

  const slateSize = Math.max(1, Number(options.slateSize) || RECOMMENDATION_SLATE_SIZE)
  const strongCount = Math.min(slateSize, Math.max(0, Number(options.strongCount) || RECOMMENDATION_STRONG_COUNT))
  const adjacentCount = Math.min(slateSize - strongCount, Math.max(0, Number(options.adjacentCount) || RECOMMENDATION_ADJACENT_COUNT))
  const wildcardCount = Math.min(
    slateSize - strongCount - adjacentCount,
    Math.max(0, Number(options.wildcardCount) || RECOMMENDATION_WILDCARD_COUNT),
  )

  const strictByLane = rankedEligibleByLane(activeLanes, byLane || {}, now, options)
  const selected = []

  if (activeLanes.length === 1) {
    addUnique(selected, withKind(interleave(activeLanes, strictByLane), 'strong'), slateSize)
  } else {
    const tasteLanes = activeLanes.filter((lane) => lane.key !== NEW_LANE.key)
    const newLane = activeLanes.find((lane) => lane.key === NEW_LANE.key)
    addUnique(selected, withKind(interleave(tasteLanes, strictByLane), 'strong'), strongCount)

    if (newLane) {
      const newPicks = (strictByLane[newLane.key] || []).map((game) => ({ ...game, lane: newLane }))
      addUnique(
        selected,
        withKind(newPicks.filter((game) => sharesTrait(game, selected)), 'adjacent'),
        strongCount + adjacentCount,
      )
      const wildcard = newPicks
        .filter((game) => !selected.some((pick) => String(pick.id) === String(game.id)))
        .map((game, index) => ({ game, index, similarity: similarityCount(game, selected) }))
        .sort((a, b) => a.similarity - b.similarity || a.index - b.index)
        .map(({ game }) => game)
      addUnique(
        selected,
        withKind(wildcard, 'wildcard'),
        strongCount + adjacentCount + wildcardCount,
      )
    }

    addUnique(selected, withKind(interleave(activeLanes, strictByLane), 'strong'), slateSize)
  }

  if (selected.length < slateSize && options.excludedIds?.size) {
    const relaxedByLane = rankedEligibleByLane(activeLanes, byLane || {}, now, options, true)
    addUnique(
      selected,
      withKind(interleave(activeLanes, relaxedByLane), 'returning'),
      Math.min(slateSize, selected.length + 2),
    )
  }

  return selected.slice(0, slateSize)
}

// Surprise me deliberately searches outside the active batch. The least-similar
// eligible New picks lead, followed by the wider taste pool if New is sparse.
// Returning this as an ordered list lets the UI offer another surprise without
// randomising or consuming the main deck.
export function buildRecommendationSurprises(lanes, byLane, now = Date.now(), options = {}) {
  const activeLanes = (lanes || []).filter(Boolean)
  if (!activeLanes.length) return []
  const strictByLane = rankedEligibleByLane(activeLanes, byLane || {}, now, options)
  const baseline = options.baseline || []
  const newLane = activeLanes.find((lane) => lane.key === NEW_LANE.key)
  const newPicks = newLane
    ? (strictByLane[newLane.key] || []).map((game) => ({ ...game, lane: newLane }))
    : []
  const adventurous = newPicks
    .map((game, index) => ({ game, index, similarity: similarityCount(game, baseline) }))
    .sort((a, b) => a.similarity - b.similarity || a.index - b.index)
    .map(({ game }) => game)
  const wider = interleave(activeLanes, strictByLane)
  const out = []
  addUnique(out, withKind([...adventurous, ...wider], 'surprise'), Number(options.limit) || 12)
  return out
}

// Taste lanes arrive before the general New lane. That lets the most specific
// explanation claim a duplicate before the generic release lane sees it.
export function interleave(lanes, byLane, { drop } = {}) {
  const out = []
  const seen = new Set()
  const skip = drop || (() => false)
  const depth = Math.max(0, ...lanes.map((lane) => (byLane[lane.key] || []).length))
  for (let index = 0; index < depth; index += 1) {
    for (const lane of lanes) {
      const game = (byLane[lane.key] || [])[index]
      if (!game || seen.has(game.id) || skip(game)) continue
      seen.add(game.id)
      out.push({ ...game, lane })
    }
  }
  return out
}
