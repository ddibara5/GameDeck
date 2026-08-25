import { supabase } from './supabase.js'
import { idbDel, idbSet, swr } from './idbCache.js'
export {
  REACTIONS,
  chooseComparisonPair,
  eloChange,
  expectedScore,
  isRankingEligible,
  seedForReaction,
  tierForPosition,
} from './rankingMath.js'

const STATE_KEY = 'ranking:state'
const SCORES_KEY = 'ranking:scores'
const GAME_KEY = (id) => `ranking:game:${id}`
const DISCOVER_TASTE_KEY = 'discover:tasteProbe'
const RANKING_EVENT = 'gd-ranking-change'

let stateCache = null
let stateInflight = null
let scoresCache = null
let scoresInflight = null
const gameCache = new Map()

async function fetchRankingState() {
  const [rankRes, comparisonRes] = await Promise.all([
    supabase.from('game_ranks').select('master_id,score,comparison_count,reaction,updated_at').order('score', { ascending: false }),
    supabase.from('rank_comparisons').select('left_id,right_id,result,compared_at').order('compared_at', { ascending: false }).limit(500),
  ])
  if (rankRes.error) throw new Error(rankRes.error.message || 'Could not load rankings')
  if (comparisonRes.error) throw new Error(comparisonRes.error.message || 'Could not load comparisons')
  return { ranks: rankRes.data || [], comparisons: comparisonRes.data || [] }
}

function promoteState(state) {
  stateCache = state || { ranks: [], comparisons: [] }
  scoresCache = stateCache.ranks.map(({ master_id, score }) => ({ master_id, score }))
  for (const row of stateCache.ranks) gameCache.set(String(row.master_id), row)
  return stateCache
}

export function getRankingStateCache() {
  return stateCache
}

export function getGameRankCache(masterId) {
  if (masterId == null) return undefined
  return gameCache.has(String(masterId)) ? gameCache.get(String(masterId)) : undefined
}

export async function loadRankingState(force = false, onFresh) {
  if (stateCache && !force) return stateCache
  if (force) {
    const state = promoteState(await fetchRankingState())
    idbSet(STATE_KEY, state)
    idbSet(SCORES_KEY, scoresCache)
    return state
  }
  if (stateInflight) return stateInflight

  stateInflight = swr(STATE_KEY, fetchRankingState, {
    maxAge: 0,
    onFresh: (state) => {
      const next = promoteState(state)
      if (onFresh) onFresh(next)
    },
  })
    .then(({ value }) => stateCache || promoteState(value))
    .finally(() => {
      stateInflight = null
    })
  return stateInflight
}

export async function loadRankingScores() {
  if (scoresCache) return scoresCache
  if (stateCache) {
    promoteState(stateCache)
    return scoresCache
  }
  if (scoresInflight) return scoresInflight

  scoresInflight = swr(
    SCORES_KEY,
    async () => {
      const { data, error } = await supabase.from('game_ranks').select('master_id,score')
      if (error) throw new Error(error.message || 'Could not load ranking scores')
      return data || []
    },
    {
      maxAge: 0,
      onFresh: (rows) => {
        scoresCache = rows || []
      },
    },
  )
    .then(({ value }) => {
      if (!scoresCache) scoresCache = value || []
      return scoresCache
    })
    .finally(() => {
      scoresInflight = null
    })
  return scoresInflight
}

export async function loadGameRank(masterId, onFresh) {
  const id = Number(masterId)
  if (!id) return null
  if (gameCache.has(String(id))) return gameCache.get(String(id))

  const { value } = await swr(
    GAME_KEY(id),
    async () => {
      const { data, error } = await supabase
        .from('game_ranks')
        .select('master_id,score,reaction,comparison_count,updated_at')
        .eq('master_id', id)
        .maybeSingle()
      if (error) throw new Error(error.message || 'Could not load game rank')
      return data || false
    },
    {
      maxAge: 5 * 60 * 1000,
      onFresh: (row) => {
        const next = row || null
        gameCache.set(String(id), next)
        if (onFresh) onFresh(next)
      },
    },
  )
  // A background refresh can finish before swr() returns its stale value.
  // Preserve the fresher value promoted by onFresh in that case.
  if (!gameCache.has(String(id))) gameCache.set(String(id), value || null)
  return gameCache.get(String(id))
}

function invalidateRankingCaches(masterId) {
  stateCache = null
  scoresCache = null
  idbDel(STATE_KEY)
  idbDel(SCORES_KEY)
  // For You uses reactions and Elo as bounded taste evidence. A ranking action
  // should be visible on the next feed render, not after its 24-hour profile TTL.
  const clearTaste = idbDel(DISCOVER_TASTE_KEY)
  if (typeof window !== 'undefined') {
    clearTaste.finally(() => window.dispatchEvent(new Event(RANKING_EVENT)))
  }
  if (masterId != null) {
    gameCache.delete(String(masterId))
    idbDel(GAME_KEY(Number(masterId)))
  }
}

export async function setRankReaction(masterId, reaction) {
  const { error } = await supabase.rpc('set_rank_reaction', {
    p_master_id: Number(masterId),
    p_reaction: reaction,
  })
  if (error) throw new Error(error.message || 'Could not save reaction')
  invalidateRankingCaches(masterId)
}

export async function recordComparison(leftId, rightId, result) {
  const { data, error } = await supabase.rpc('record_rank_comparison', {
    p_left_id: Number(leftId),
    p_right_id: Number(rightId),
    p_result: result,
  })
  if (error) throw new Error(error.message || 'Could not save comparison')
  invalidateRankingCaches(leftId)
  gameCache.delete(String(rightId))
  idbDel(GAME_KEY(Number(rightId)))
  return data
}
