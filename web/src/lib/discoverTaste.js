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

const DAY_MS = 24 * 60 * 60 * 1000
const RECENCY_HALF_LIFE_DAYS = 120

function clamp(min, max, value) {
  return Math.max(min, Math.min(max, value))
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

export function rankLanes(rows, now = Date.now()) {
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
      out.push({
        ...lane,
        strength,
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

function candidateScore(game, now, wishlistIds) {
  const rating = Number(game?.rating)
  const votes = Math.max(0, Number(game?.ratingCount) || 0)
  const confidence = votes / (votes + 25)
  const quality = Number.isFinite(rating) ? confidence * (rating / 100) + (1 - confidence) * 0.72 : 0.72
  const releasedAt = Number(game?.released) * 1000
  const daysAgo = Number.isFinite(releasedAt) && releasedAt > 0 ? Math.max(0, (now - releasedAt) / DAY_MS) : 1095
  const freshness = 1 - clamp(0, 1, daysAgo / 1095)
  const wished = wishlistIds && (
    wishlistIds.has(game?.id)
    || wishlistIds.has(Number(game?.id))
    || wishlistIds.has(String(game?.id))
  )
  return freshness * 0.58 + quality * 0.42 + (wished ? 0.14 : 0)
}

export function rankCandidates(games, now = Date.now(), { wishlistIds } = {}) {
  return (games || [])
    .map((game, index) => ({ game, index, score: candidateScore(game, now, wishlistIds) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ game }) => game)
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
