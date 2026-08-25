import { supabase } from './supabase.js'
export {
  REACTIONS,
  chooseComparisonPair,
  eloChange,
  expectedScore,
  isRankingEligible,
  seedForReaction,
  tierForPosition,
} from './rankingMath.js'

export async function loadRankingState() {
  const [rankRes, comparisonRes] = await Promise.all([
    supabase.from('game_ranks').select('master_id,score,comparison_count,reaction,updated_at').order('score', { ascending: false }),
    supabase.from('rank_comparisons').select('left_id,right_id,result,compared_at').order('compared_at', { ascending: false }).limit(500),
  ])
  if (rankRes.error) throw new Error(rankRes.error.message || 'Could not load rankings')
  if (comparisonRes.error) throw new Error(comparisonRes.error.message || 'Could not load comparisons')
  return { ranks: rankRes.data || [], comparisons: comparisonRes.data || [] }
}

export async function setRankReaction(masterId, reaction) {
  const { error } = await supabase.rpc('set_rank_reaction', {
    p_master_id: Number(masterId),
    p_reaction: reaction,
  })
  if (error) throw new Error(error.message || 'Could not save reaction')
}

export async function recordComparison(leftId, rightId, result) {
  const { data, error } = await supabase.rpc('record_rank_comparison', {
    p_left_id: Number(leftId),
    p_right_id: Number(rightId),
    p_result: result,
  })
  if (error) throw new Error(error.message || 'Could not save comparison')
  return data
}
