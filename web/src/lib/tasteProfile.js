// Client-side loader for the visible taste profile surface.
//
// The taste-derivation math lives in tasteEvidence.js (buildTasteEvidenceProfile),
// which is shared with the For You engine and the Ask GameDeck server route.
// This module is the client cache + fetch layer: it pulls the same bootstrap
// inputs For You uses, builds the profile, and keeps it fresh across duel,
// reaction, and wishlist changes. Supabase is imported lazily so this module
// stays import-safe in node:test.

import { idbDel, idbGet, idbSet } from './idbCache.js'
import { buildTasteEvidenceProfile } from './tasteEvidence.js'

export const TASTE_PROFILE_CACHE_KEY = 'tasteProfile:v1'
export const TASTE_PROFILE_TTL_MS = 10 * 60 * 1000
// The visible surface shows every lane with evidence, not just the top four
// the For You engine asks the catalog for.
export const TASTE_PROFILE_MAX_LANES = 9

async function defaultFetchInputs() {
  const { supabase } = await import('./supabase.js')
  if (!supabase) throw new Error('GameDeck is not configured.')
  const [bootstrap, comparisons] = await Promise.all([
    supabase.rpc('get_for_you_bootstrap'),
    supabase
      .from('rank_comparisons')
      .select('id,left_id,right_id,result,compared_at')
      .order('compared_at', { ascending: false })
      .limit(500),
  ])
  if (bootstrap.error || !bootstrap.data) {
    throw new Error(bootstrap.error?.message || 'Taste profile is unavailable.')
  }
  const data = bootstrap.data
  const rows = comparisons.error ? [] : comparisons.data || []
  return {
    games: data.games || [],
    ranks: data.ranks || [],
    activity: data.activity || [],
    comparisons: rows,
    coverage: {
      games: (data.games || []).length < 100,
      ranks: true,
      activity: (data.activity || []).length < 500,
      comparisons: rows.length < 500,
    },
  }
}

// Load the taste profile, from the IDB cache when fresh. `fetchInputs` is
// injectable so tests can drive the loader without Supabase.
export async function loadTasteProfile({
  force = false,
  fetchInputs = defaultFetchInputs,
  now = Date.now(),
} = {}) {
  if (!force) {
    try {
      const cached = await idbGet(TASTE_PROFILE_CACHE_KEY)
      if (
        cached &&
        cached.value &&
        cached.value.profile &&
        now - (cached.value.at || 0) < TASTE_PROFILE_TTL_MS
      ) {
        return cached.value.profile
      }
    } catch {
      // A broken cache never blocks the profile; fall through to the network.
    }
  }
  const inputs = await fetchInputs()
  const profile = buildTasteEvidenceProfile({
    ...inputs,
    maxLanes: TASTE_PROFILE_MAX_LANES,
    now,
  })
  try {
    await idbSet(TASTE_PROFILE_CACHE_KEY, { at: now, profile })
  } catch {
    // Losing the cache only costs a refetch on the next visit.
  }
  return profile
}

export function bustTasteProfile() {
  try {
    return idbDel(TASTE_PROFILE_CACHE_KEY)
  } catch {
    return Promise.resolve()
  }
}

// A short receipt shown after a Compare duel: what moved, the winner's duel
// record, and which taste lanes the winner feeds. Reactions and duel outcomes
// stay separate facts here, exactly like they do in Ask GameDeck evidence.
export function buildDuelReceipt({
  winnerId,
  loserId,
  winnerTitle,
  loserTitle,
  result,
  ranks = [],
  profile = null,
}) {
  if (result === 'skip') return null
  const rankById = new Map(
    (ranks || []).map((row) => [Number(row?.master_id), row]),
  )
  const winnerRank = rankById.get(Number(winnerId))
  const winnerSource =
    (profile?.sources || []).find(
      (source) => Number(source.masterId) === Number(winnerId),
    ) || null
  const lanes = (profile?.lanes || []) || []
  const laneLabels = (winnerSource?.laneKeys || [])
    .map((key) => lanes.find((lane) => lane.key === key)?.label)
    .filter(Boolean)
  const duel = winnerSource?.duel || null
  const duelText =
    duel && duel.decidedComparisons > 0
      ? `${duel.wins}-${duel.losses} in duels`
      : 'first recorded duel'
  const scoreText =
    winnerRank && Number.isFinite(Number(winnerRank.score))
      ? `Elo ${Math.round(Number(winnerRank.score))}`
      : null
  return {
    headline: `You ranked ${winnerTitle} above ${loserTitle}.`,
    detail: [scoreText, duelText].filter(Boolean).join(' · '),
    laneLabels,
    winnerId: Number(winnerId),
    loserId: Number(loserId),
  }
}
