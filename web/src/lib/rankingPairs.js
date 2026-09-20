// Node-safe pure helpers for ranking pair selection and lane filtering.
// ranking.js imports supabase (browser-only via import.meta.env), so the pure
// rules live here where node:test can import them; ranking.js re-exports them
// for the components. Skip semantics mirror the pilot's ranking-pair.ts:
// a pair stays out of rotation when a 'skip' comparison for it is recent.

export const RANK_PAIR_SKIP_CUTOFF_DAYS = 90
export const RANK_PAIR_SKIP_CUTOFF_MS = RANK_PAIR_SKIP_CUTOFF_DAYS * 86400000

function pairKey(a, b) {
  const x = Number(a)
  const y = Number(b)
  return x < y ? `${x}|${y}` : `${y}|${x}`
}

function positiveInt(value) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function recentSkipKeys(comparisons, cutoff) {
  const skipped = new Set()
  for (const item of comparisons || []) {
    if (item.result === 'skip' && cutoff != null && Date.parse(item.compared_at) >= cutoff) {
      skipped.add(pairKey(item.left_id, item.right_id))
    }
  }
  return skipped
}

// Keep ranked items whose game belongs to both the lane and the owned set.
// rankedItems carry { rank, game } or { game: { master_id }, rank } shapes;
// the master id is taken from the game first, then the rank row.
export function eligibleOwnedLaneRankings(rankedItems, laneMasterIds, ownedMasterIds) {
  if (!Array.isArray(rankedItems)) return []
  const toIdSet = (values) => {
    const source = values instanceof Set ? [...values] : values || []
    return new Set(source.map((value) => positiveInt(value)).filter(Boolean))
  }
  const lane = toIdSet(laneMasterIds)
  const owned = toIdSet(ownedMasterIds)
  return rankedItems.filter((item) => {
    const id = positiveInt(item?.game?.master_id ?? item?.rank?.master_id)
    return id != null && lane.has(id) && owned.has(id)
  })
}

// Latest decided (non-skip) comparison time for a pair key, or null when the
// matchup is unseen.
function lastDecidedAt(comparisons, key) {
  let latest = null
  for (const item of comparisons || []) {
    if (item.result === 'skip') continue
    if (pairKey(item.left_id, item.right_id) !== key) continue
    const at = Date.parse(item.compared_at)
    if (Number.isFinite(at) && (latest == null || at > latest)) latest = at
  }
  return latest
}

// Lane-anchored duel pairing: the anchor rank leads on the left; the opponent
// is chosen among the other ranks (recently-skipped pairs excluded) by:
// unseen matchup first, then the oldest last-decided matchup, then closest
// Elo to the anchor, then fewest comparisons, then lowest master id.
// Returns { left, right } or null when the anchor is missing or there is no
// eligible opponent.
export function chooseAnchoredRankingPair(
  ranks,
  comparisons,
  cutoff = Date.now() - RANK_PAIR_SKIP_CUTOFF_MS,
  anchorMasterId,
) {
  if (!Array.isArray(ranks) || ranks.length < 2) return null
  const anchorId = positiveInt(anchorMasterId)
  if (anchorId == null) return null
  const anchor = ranks.find((rank) => Number(rank.master_id) === anchorId)
  if (!anchor) return null
  const anchorScore = Number(anchor.score) || 0
  const skipped = recentSkipKeys(comparisons, cutoff)
  const opponents = ranks
    .filter(
      (rank) =>
        Number(rank.master_id) !== anchorId &&
        !skipped.has(pairKey(anchorId, rank.master_id)),
    )
    .map((rank) => ({
      rank,
      key: pairKey(anchorId, rank.master_id),
    }))
    .sort((a, b) => {
      const aSeen = lastDecidedAt(comparisons, a.key)
      const bSeen = lastDecidedAt(comparisons, b.key)
      if ((aSeen == null) !== (bSeen == null)) return aSeen == null ? -1 : 1
      if (aSeen != null && bSeen != null && aSeen !== bSeen) return aSeen - bSeen
      const eloGap =
        Math.abs(Number(a.rank.score) - anchorScore) - Math.abs(Number(b.rank.score) - anchorScore)
      if (eloGap !== 0) return eloGap
      const countGap =
        Number(a.rank.comparison_count || 0) - Number(b.rank.comparison_count || 0)
      if (countGap !== 0) return countGap
      return Number(a.rank.master_id) - Number(b.rank.master_id)
    })
  const winner = opponents[0]
  return winner ? { left: anchor, right: winner.rank } : null
}
