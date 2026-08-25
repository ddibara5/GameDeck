export const REACTIONS = [
  { key: 'loved', label: 'Loved it', score: 1650 },
  { key: 'liked', label: 'Liked it', score: 1550 },
  { key: 'mixed', label: 'Mixed', score: 1450 },
  { key: 'not_for_me', label: 'Not for me', score: 1350 },
]

export function seedForReaction(reaction) {
  return REACTIONS.find((item) => item.key === reaction)?.score ?? 1500
}

export function expectedScore(scoreA, scoreB) {
  return 1 / (1 + 10 ** ((scoreB - scoreA) / 400))
}

export function eloChange(scoreA, scoreB, comparisonsA, comparisonsB, resultA) {
  const k = comparisonsA < 6 || comparisonsB < 6 ? 32 : 16
  const delta = Math.round(k * (resultA - expectedScore(scoreA, scoreB)) * 100) / 100
  return { a: scoreA + delta, b: scoreB - delta, delta, k }
}

export function tierForPosition(index, total) {
  if (total <= 0) return 'C'
  const percentile = (index + 1) / total
  if (percentile <= 0.1) return 'S'
  if (percentile <= 0.3) return 'A'
  if (percentile <= 0.65) return 'B'
  return 'C'
}

export function isRankingEligible(game, explicit) {
  if (!game) return false
  if (explicit === 'finished') return true
  const minutes = Number(game.playtime_minutes) || 0
  const story = Number(game.length_minutes) || 0
  return minutes >= 120 || (story > 0 && minutes / story >= 0.2)
}

function pairKey(a, b) {
  return [Number(a), Number(b)].sort((x, y) => x - y).join(':')
}

export function chooseComparisonPair(ranks, comparisons, now = Date.now()) {
  if (!Array.isArray(ranks) || ranks.length < 2) return null
  const recentSkips = new Set()
  const cutoff = now - 90 * 86400000
  for (const item of comparisons || []) {
    if (item.result === 'skip' && Date.parse(item.compared_at) >= cutoff) {
      recentSkips.add(pairKey(item.left_id, item.right_id))
    }
  }

  const byUncertainty = [...ranks].sort((a, b) =>
    Number(a.comparison_count || 0) - Number(b.comparison_count || 0) || Number(b.score) - Number(a.score)
  )
  for (const anchor of byUncertainty) {
    const neighbors = ranks
      .filter((candidate) => candidate.master_id !== anchor.master_id)
      .sort((a, b) => Math.abs(Number(a.score) - Number(anchor.score)) - Math.abs(Number(b.score) - Number(anchor.score)))
    const neighbor = neighbors.find((candidate) => !recentSkips.has(pairKey(anchor.master_id, candidate.master_id)))
    if (neighbor) return [anchor, neighbor]
  }
  return null
}
