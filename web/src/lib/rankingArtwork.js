import { loadRankingState } from './ranking.js'
import { preloadLibrary } from './useLibraryGames.js'
import { libraryCover } from './format.js'
import { warmCover } from './coverLoading.js'

export async function warmRankingArtwork(isCancelled = () => false) {
  const [state, games] = await Promise.all([loadRankingState(), preloadLibrary()])
  if (isCancelled()) return
  const gameById = new Map(games.map((game) => [String(game.master_id), game]))
  const firstGames = state.ranks.map((rank) => gameById.get(String(rank.master_id))).filter(Boolean).slice(0, 8)
  // One image at a time after Home loads; navigation cancels the remaining queue.
  for (const game of firstGames) {
    if (isCancelled()) return
    await warmCover(libraryCover(game), '64px')
  }
}
