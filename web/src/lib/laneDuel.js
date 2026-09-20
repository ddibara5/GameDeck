// Lane-duel flywheel: the reverse direction of the taste engine loop.
//
// A For You recommendation's explanation sheet can push Rankings compare
// mode with a lane-anchored pairing (lane + anchor + recommendation), and a
// decided duel returns to For You with an in-memory receipt that marks the
// tuned card. Ported from the Expo pilot's ranking-flow.ts, ranking-pair.ts
// (selection rules) and ranking-receipt.ts (receipt rules), adapted to the
// PWA's tab navigation and module shapes. No new tables; the receipt never
// touches the network. Supabase is imported lazily so this module stays
// import-safe in node:test.

import { TASTE_LANES } from './tasteEvidence.js'

export const LANE_DUEL_RECEIPT_TTL_MS = 5 * 60 * 1000

const VALID_LANE_KEYS = new Set(TASTE_LANES.map((lane) => lane.key))

function positiveId(value) {
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  return typeof parsed === 'number' && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

// Validate a tune launch. Unknown lanes are ignored (the launch degrades to
// standard compare); the anchor and recommendation ids are only kept when a
// valid lane is present, mirroring the pilot's parseRankingLaunch.
export function parseTuneLaunch(input = {}, validLaneKeys = VALID_LANE_KEYS) {
  const rawLane = typeof input.laneKey === 'string' ? input.laneKey : null
  const laneKey = rawLane && validLaneKeys.has(rawLane) ? rawLane : null
  const laneLabel =
    laneKey && typeof input.laneLabel === 'string' && input.laneLabel.trim()
      ? input.laneLabel.trim()
      : null
  const anchorId = laneKey ? positiveId(input.anchorId) : null
  const recommendationId = laneKey ? positiveId(input.recommendationId) : null
  const laneMemberIds =
    laneKey && Array.isArray(input.laneMemberIds)
      ? [...new Set(input.laneMemberIds.map(positiveId).filter(Boolean))]
      : []
  return {
    laneKey,
    laneLabel,
    anchorId,
    recommendationId,
    laneMemberIds,
    returnToForYou: laneKey !== null && input.returnToForYou === true,
  }
}

// A decided lane duel returns to For You; skips and lane switches do not.
export function shouldReturnFromLaneDuel(launch, activeLaneKey, result) {
  return (
    !!launch &&
    result !== 'skip' &&
    launch.returnToForYou === true &&
    activeLaneKey === launch.laneKey
  )
}

// Resolve a tune launch for a For You pick: the evidence source game anchors
// the duel, falling back to the first lane source with a reaction or duel
// history. Returns null when there is no lane or no anchorable game.
export function resolveTuneLaunch(pick, evidenceProfile) {
  const laneKey = pick?.evidence?.lane || null
  const lane = laneKey
    ? (evidenceProfile?.lanes || []).find((item) => item.key === laneKey)
    : null
  if (!lane) return null
  const anchor =
    pick?.evidence?.source ??
    (lane.sources || []).find(
      (source) => source?.reaction != null || (source?.comparisonCount || 0) > 0,
    ) ??
    null
  const anchorId = positiveId(anchor?.masterId)
  if (!anchorId) return null
  return parseTuneLaunch({
    laneKey: lane.key,
    laneLabel: lane.label,
    anchorId,
    recommendationId: positiveId(pick?.game?.id),
    laneMemberIds: (lane.sources || []).map((source) => source?.masterId),
    returnToForYou: true,
  })
}

let pendingReceipt = null

async function receiptAccount() {
  try {
    const { getForYouAccount } = await import('./forYouStorage.js')
    return (await getForYouAccount()) || null
  } catch {
    return null
  }
}

// Publish the in-memory receipt shown once on the tuned For You card.
// Scoped to the current account so it can never leak across sign-ins.
// `accountProvider` is injectable so tests can drive the receipt without
// Supabase.
export async function publishLaneDuelReceipt(receipt, { accountProvider = receiptAccount } = {}) {
  const account = await accountProvider()
  if (!account) return false
  pendingReceipt = {
    recommendationId: positiveId(receipt?.recommendationId),
    laneKey: typeof receipt?.laneKey === 'string' ? receipt.laneKey : null,
    laneLabel: typeof receipt?.laneLabel === 'string' ? receipt.laneLabel : null,
    winnerId: positiveId(receipt?.winnerId),
    winnerTitle: String(receipt?.winnerTitle ?? ''),
    loserId: positiveId(receipt?.loserId),
    loserTitle: String(receipt?.loserTitle ?? ''),
    cardLabel: `Duel added: ${receipt?.winnerTitle} over ${receipt?.loserTitle}`,
    at: Date.now(),
    account,
  }
  return true
}

// Consume the pending receipt exactly once. Returns null when there is no
// receipt, the account changed, or the receipt expired.
export async function consumeLaneDuelReceipt({ now = Date.now(), accountProvider = receiptAccount } = {}) {
  const receipt = pendingReceipt
  pendingReceipt = null
  if (!receipt) return null
  const account = await accountProvider()
  if (!account || account !== receipt.account) return null
  if (now - receipt.at > LANE_DUEL_RECEIPT_TTL_MS) return null
  const { account: _account, ...rest } = receipt
  return rest
}
