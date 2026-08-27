// The For You feed's lanes: what to ask IGDB for, and why each row is there.
//
// The feed is deliberately NOT a score. A ranked list of games with a hidden
// number behind it cannot explain itself, and an unexplainable recommendation is
// one you cannot correct. So the feed is a round robin over a handful of NAMED
// lanes, and the lane is the reason printed on the row. When a lane is wrong,
// the chip says which one.
//
// Lanes are ordered by the shared taste profile: 90-day activity first, lifetime
// play as a quieter prior, and My Ranking strengthening or removing evidence.
// The ordering is therefore explainable rather than a guess.
import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { swr } from './idbCache.js'
import { rankLanes } from './discoverTaste.js'
import { loadRecentActivity } from './recentActivity.js'
import { loadWishlist } from './wishlist.js'
import { buildTasteProfile } from './gameIntelligence.js'

export { LANE_CATALOG, NEW_LANE, MAX_TASTE_LANES, laneReason, rankCandidates, interleave } from './discoverTaste.js'

const PROBE_KEY = 'discover:tasteProfile:v3'
const PROBE_TTL = 6 * 60 * 60 * 1000
const RANKING_EVENT = 'gd-ranking-change'

// The taste profile's keyword sidecar.
//
// Deliberately NOT `useLibraryGames`, and this is the one place in the app where
// a second query against `games` is the right answer rather than the bug the
// operations doc warns about. Two reasons, both about size: it needs `keywords`,
// which the library payload does not carry precisely because those columns are
// 234 kB of a 758 kB response, and it needs about sixty rows rather than all
// 513. Every column it selects is read here and nowhere else, so it cannot drift
// out of step with a surface that expects something different.
//
// Up to one hundred most-recently-played keyword rows. The activity window is
// joined below and carries the stronger weight; this query supplies only the
// genres/themes needed to turn that behavior into named lanes.
async function fetchTasteProfile() {
  const [gameRes, rankRes, activity, wishlist, laneFeedbackRes, gameFeedbackRes] = await Promise.all([
    supabase
      .from('games')
      .select('master_id, title, keywords, playtime_minutes, last_played')
      .not('last_played', 'is', null)
      .order('last_played', { ascending: false })
      .limit(100),
    supabase.from('game_ranks').select('master_id, score, reaction, comparison_count'),
    loadRecentActivity({ days: 90, limit: 500 }),
    loadWishlist(),
    supabase
      .from('v_recommendation_lane_feedback')
      .select('lane_key,exposure_count,detail_open_count,meaningful_outcome_count,last_shown_at'),
    supabase
      .from('v_recommendation_game_feedback')
      .select('igdb_id,exposure_count,detail_open_count,meaningful_outcome_count,last_shown_at'),
  ])
  if (gameRes.error) throw new Error(gameRes.error.message || 'Taste probe failed')
  const profile = buildTasteProfile({
    games: gameRes.data || [],
    ranks: rankRes.data || [],
    activity,
    wishlist,
  })
  const laneFeedback = new Map((laneFeedbackRes.error ? [] : laneFeedbackRes.data || []).map((row) => [row.lane_key, row]))
  const gameFeedback = new Map((gameFeedbackRes.error ? [] : gameFeedbackRes.data || []).map((row) => [String(row.igdb_id), row]))
  const recommendationOutcomeCount = [...gameFeedback.values()]
    .reduce((sum, row) => sum + Math.max(0, Number(row.meaningful_outcome_count) || 0), 0)
  return { ...profile, laneFeedback, gameFeedback, recommendationOutcomeCount }
}

export function useTasteProfile() {
  const [profile, setProfile] = useState(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1)
    window.addEventListener(RANKING_EVENT, refresh)
    return () => window.removeEventListener(RANKING_EVENT, refresh)
  }, [])

  useEffect(() => {
    let alive = true
    swr(PROBE_KEY, fetchTasteProfile, { maxAge: PROBE_TTL })
      .then(({ value }) => alive && setProfile({
        lanes: rankLanes(value?.rows || [], Date.now(), { laneFeedback: value?.laneFeedback }),
        gameFeedback: value?.gameFeedback || new Map(),
        evidence: value?.evidence
          ? { ...value.evidence, recommendationOutcomeCount: value?.recommendationOutcomeCount || 0 }
          : null,
      }))
      // A failed probe is not worth surfacing: the feed falls back to the
      // platform lane on its own, which is still the useful half.
      .catch(() => alive && setProfile({ lanes: [], gameFeedback: new Map(), evidence: null }))
    return () => {
      alive = false
    }
  }, [revision])
  return profile
}
