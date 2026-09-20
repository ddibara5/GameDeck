// Continue Playing selection: the single most recently played in-progress
// game for Home's compact hero.
//
// statusOf(game) returns the game's effective status; finished and abandoned
// games are skipped, as are games with no playtime. A valid last_played is
// required: without it there is no "most recent" to rank by, and the hero
// stays hidden instead of picking an arbitrary undated game. Strict >
// keeps the first game on exact timestamp ties, so the pick is deterministic.
export function selectContinueGame(games, statusOf) {
  let best = null
  let bestTime = -1
  for (const game of games || []) {
    if (!(Number(game.playtime_minutes) > 0)) continue
    if (statusOf) {
      const status = statusOf(game)
      if (status === 'finished' || status === 'abandoned') continue
    }
    const t = Date.parse(game.last_played || '')
    if (Number.isFinite(t) && t > bestTime) {
      best = game
      bestTime = t
    }
  }
  return best
}
