// The For You feed's lanes: what to ask IGDB for, and why each row is there.
//
// The feed is deliberately NOT a score. A ranked list of games with a hidden
// number behind it cannot explain itself, and an unexplainable recommendation is
// one you cannot correct. So the feed is a round robin over a handful of NAMED
// lanes, and the lane is the reason printed on the row. When a lane is wrong,
// the chip says which one.
//
// Lanes are ordered by hours actually played, from a small taste probe of the
// library, so the ordering is evidence rather than a guess.
import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { swr } from './idbCache.js'

// Every key here is a PRESET key in api/discover.js, except `new`, which is the
// `recent` rail narrowed to your platforms. `terms` are matched against
// `games.keywords`, which holds IGDB keywords AND themes, lowercased.
//
// The terms lists carry every spelling IGDB uses, for the same reason
// lib/vibes.js does: `soulslike` and `souls-like` are both live, and matching
// only one under-reports a lane by about half.
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

// The platform lane. Not derived from taste, and it always runs: it answers
// "what came out lately on my hardware", which is the question the old
// "Recently released" rail was supposed to answer and could not, because it was
// never filtered on hardware at all.
export const NEW_LANE = { key: 'new', label: 'New on your platforms' }

// How many taste lanes ride alongside it. Four keeps a round robin readable:
// with five lanes total, the first five rows are five different reasons, which
// is what makes the feed legible on first sight rather than looking like one
// long genre list.
export const MAX_TASTE_LANES = 4

const PROBE_KEY = 'discover:tasteProbe'
const PROBE_TTL = 24 * 60 * 60 * 1000

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
    supabase.from('game_ranks').select('master_id, score, reaction'),
  ])
  if (gameRes.error) throw new Error(gameRes.error.message || 'Taste probe failed')
  const ranks = new Map((rankRes.data || []).map((row) => [String(row.master_id), row]))
  return (gameRes.data || []).map((row) => ({ ...row, personalRank: ranks.get(String(row.master_id)) || null }))
}

// Rank the catalog against the probe. A lane needs at least two games behind it,
// so one outlier cannot mint a whole lane, and it carries its heaviest game as
// the exemplar the row chip names.
export function rankLanes(rows) {
  const out = []
  for (const lane of LANE_CATALOG) {
    let minutes = 0
    let count = 0
    let top = null
    for (const r of rows || []) {
      const kw = (r && r.keywords) || []
      if (!lane.terms.some((t) => kw.indexOf(t) >= 0)) continue
      count += 1
      // Explicit ranking nudges a lane without replacing the play evidence. A
      // 1650 favorite is worth 1.3x its minutes, a 1350 "not for me" is worth
      // 0.7x. Unranked games stay exactly 1x.
      const rankWeight = r.personalRank ? Math.max(0.7, Math.min(1.3, 1 + (Number(r.personalRank.score) - 1500) / 500)) : 1
      const weightedMinutes = (Number(r.playtime_minutes) || 0) * rankWeight
      minutes += weightedMinutes
      if (!top || weightedMinutes > (Number(top.weightedMinutes) || 0)) top = { ...r, weightedMinutes }
    }
    if (count >= 2) out.push({ ...lane, minutes, count, exemplar: top ? top.title : null })
  }
  out.sort((a, b) => b.minutes - a.minutes)
  return out.slice(0, MAX_TASTE_LANES)
}

// What the chip on a row says. The exemplar is the point: "Soulslike" is a
// category and "Soulslike, like Kristala" is a reason.
export function laneReason(lane) {
  if (!lane) return ''
  if (lane.key === 'new') return NEW_LANE.label
  return lane.exemplar ? `${lane.label}, like ${lane.exemplar}` : lane.label
}

// Round robin, so the top of the feed is one row per reason rather than a run of
// one lane. `seen` also dedupes across lanes: a game can be both a soulslike and
// post-apocalyptic, and it should appear once, under whichever lane reached it
// first (which is the higher-ranked one, since lanes arrive in order).
export function interleave(lanes, byLane, { drop } = {}) {
  const out = []
  const seen = new Set()
  const skip = drop || (() => false)
  const depth = Math.max(0, ...lanes.map((l) => (byLane[l.key] || []).length))
  for (let i = 0; i < depth; i += 1) {
    for (const lane of lanes) {
      const g = (byLane[lane.key] || [])[i]
      if (!g || seen.has(g.id) || skip(g)) continue
      seen.add(g.id)
      out.push({ ...g, lane })
    }
  }
  return out
}

export function useTasteLanes() {
  const [lanes, setLanes] = useState(null)
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
  }, [])
  return lanes
}
