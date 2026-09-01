// Shared genre normalization for filters that operate across library rows and
// richer IGDB records. Library rows carry one `genre`; catalog rows carry an
// array, and callers should not need to care which shape they received.
export function gameGenres(item) {
  if (!item) return []
  if (Array.isArray(item.genres)) return item.genres
  return item.genre ? [item.genre] : []
}

export function topGenres(games, count = 6) {
  const tally = new Map()
  for (const game of games || []) {
    for (const genre of gameGenres(game)) tally.set(genre, (tally.get(genre) || 0) + 1)
  }
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([genre]) => genre)
}

