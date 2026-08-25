// The For You feed's lanes: what to ask IGDB for, and why each row is there.
//
// The feed is deliberately NOT a score. A ranked list of games with a hidden
// number behind it cannot explain itself, and an unexplainable recommendation is
// one you cannot correct. So the feed is a round robin over a handful of NAMED
// lanes, and the lane is the reason printed on the row. When a lane is wrong,
// the chip says which one.
//
// Lanes are ordered by recent, meaningful play from a small taste probe of the
// library, with My Ranking reactions and comparisons strengthening or removing
// that evidence. The ordering is therefore explainable rather than a guess.
import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { swr } from './idbCache.js'
import { rankLanes } from './discoverTaste.js'

export { LANE_CATALOG, NEW_LANE, MAX_TASTE_LANES, laneReason, rankCandidates, interleave } from './discoverTaste.js'

const PROBE_KEY = 'discover:tasteProbe'
const PROBE_TTL = 24 * 60 * 60 * 1000
const RANKING_EVENT = 'gd-ranking-change'

// The taste probe.
//
// Deliberately NOT `useLibraryGames`, and this is the one place in the app where
// a second query against `games` is the right answer rather than the bug the
// operations doc warns about. Two reasons, both about size: it needs `keywords`,
// which the library payload does not carry precisely because those columns are
// 234 kB of a 758 kB response, and it needs about sixty rows rather than all
// 513. Every column it selects is read here and nowhere else, so it cannot drift
// out of step with a surface that expects something different.
//
// Sixty most-recently-played rows with real time on them. Recency matters more
// than lifetime totals: a library's all-time top is a decade of history, and
// what you have been playing lately is what a discovery feed should look like.
async function fetchTasteProbe() {
  const [gameRes, rankRes] = await Promise.all([
    supabase
      .from('games')
      .select('master_id, title, keywords, playtime_minutes, last_played')
      .gte('playtime_minutes', 120)
      .not('last_played', 'is', null)
      .order('last_played', { ascending: false })
      .limit(60),
    supabase.from('game_ranks').select('master_id, score, reaction, comparison_count'),
  ])
  if (gameRes.error) throw new Error(gameRes.error.message || 'Taste probe failed')
  const ranks = new Map((rankRes.data || []).map((row) => [String(row.master_id), row]))
  return (gameRes.data || []).map((row) => ({ ...row, personalRank: ranks.get(String(row.master_id)) || null }))
}

export function useTasteLanes() {
  const [lanes, setLanes] = useState(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1)
    window.addEventListener(RANKING_EVENT, refresh)
    return () => window.removeEventListener(RANKING_EVENT, refresh)
  }, [])

  useEffect(() => {
    let alive = true
    swr(PROBE_KEY, fetchTasteProbe, { maxAge: PROBE_TTL })
      .then(({ value }) => alive && setLanes(rankLanes(value)))
      // A failed probe is not worth surfacing: the feed falls back to the
      // platform lane on its own, which is still the useful half.
      .catch(() => alive && setLanes([]))
    return () => {
      alive = false
    }
  }, [revision])
  return lanes
}
