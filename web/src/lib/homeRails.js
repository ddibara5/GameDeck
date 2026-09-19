// Home activity rails: which library games count as "recently played" and how
// the Recent play rail orders them, plus wishlist-to-library progress lookup.
//
// Port of the Expo pilot's Sept 11 commit (src/lib/home-rails.ts).
//
// Field mapping: none needed. The PWA's library rows carry the same Supabase
// column names the pilot's Game type uses (`last_played`, `playtime_minutes`,
// `length_minutes`, `percent`, `title`, `master_id`, `igdb_id`), verified
// against BASE_COLUMNS in web/src/lib/useLibraryGames.js. PWA wishlist rows
// also carry `igdb_id` and `title`. The only substitution is
// percentage/storyProgress, which the PWA already owns in homeInsights.js
// (matching the pilot per homeInsights.test.js), so this module does not
// duplicate that math.

import { percentage, storyProgress } from './homeInsights.js'

const recentPlayWindowMs = 14 * 24 * 60 * 60 * 1000

export function hasRecentPlay(game, now = Date.now()) {
  const playedAt = game && game.last_played ? Date.parse(game.last_played) : Number.NaN
  return (
    Number.isFinite(playedAt) &&
    playedAt <= now &&
    playedAt >= now - recentPlayWindowMs
  )
}

export function gameProgress(game) {
  return storyProgress(game.playtime_minutes, game.length_minutes) ?? percentage(game.percent)
}

// Most recently played first; ties break by progress (higher first), then by
// title A-Z. Games with no play in the last 14 days are excluded.
export function sortRecentGames(games) {
  const now = Date.now()
  return games
    .filter((game) => hasRecentPlay(game, now))
    .sort((left, right) => {
      const rightPlayed = Date.parse(right.last_played ?? '')
      const leftPlayed = Date.parse(left.last_played ?? '')
      const rightProgress = gameProgress(right) ?? -1
      const leftProgress = gameProgress(left) ?? -1
      return (
        (Number.isFinite(rightPlayed) ? rightPlayed : 0) -
          (Number.isFinite(leftPlayed) ? leftPlayed : 0) ||
        rightProgress - leftProgress ||
        left.title.localeCompare(right.title)
      )
    })
}

function normalizedTitle(title) {
  return String(title || '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// Progress for a wishlist item's matching library game, but only when that
// game was played recently (a stale library entry is not "recent play").
export function wishlistProgress(item, libraryByIgdb, libraryByTitle) {
  if (!item) return null
  const game =
    libraryByIgdb.get(item.igdb_id) ??
    libraryByTitle.get(normalizedTitle(item.title))
  return game && hasRecentPlay(game) ? gameProgress(game) : null
}

export function libraryTitleKey(title) {
  return normalizedTitle(title)
}
