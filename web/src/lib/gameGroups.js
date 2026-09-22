// One tile per game.
//
// Some games exist as several rows: the same title on different console
// generations (BioShock Infinite on Xbox 360 and Xbox One) or on several
// ecosystems (Yakuza 0 on Xbox and PlayStation). Those rows are legitimately
// distinct - per-version play history must be preserved - so this groups them
// at the display layer only. Nothing here merges or deletes data.
//
// A group is rows sharing an IGDB id AND a title (case-insensitive). Rows with
// different titles are never merged even when they share an igdb_id: those are
// editions or catalog mismatches (Witcher 3 vs Witcher 3: Complete Edition,
// Assassin's Creed vs Assassin's Creed IV), and merging them would be wrong.
//
// A grouped object spreads the primary row (most playtime, then most recent)
// so every existing reader - status, ranking, achievements link - keeps working
// on the version Dave actually played, and adds:
//   versions           every row in the group, primary first
//   version_platforms  unique platform labels across versions, in group order
//   playtime_minutes   SUMMED across versions
//   playtime_label     formatted from the sum
//   last_played        most recent across versions
import { minutesToHhm } from './format.js'

const timeOf = (value) => {
  const t = value ? new Date(value).getTime() : 0
  return Number.isNaN(t) ? 0 : t
}

export function groupKeyFor(game) {
  const id = Number(game && game.igdb_id)
  if (!id) return null
  const title = String(game.title || '').trim().toLowerCase()
  if (!title) return null
  return `igdb:${id}::${title}`
}

// Console labels for a grouped game, e.g. "Xbox 360 · Xbox One".
export function versionPlatformLabel(game) {
  const list = (game && game.version_platforms) || []
  if (!list.length) return null
  const shown = list.slice(0, 3).join(' · ')
  return list.length > 3 ? `${shown} +${list.length - 3}` : shown
}

export function groupLibraryGames(games) {
  const buckets = new Map()
  const order = []
  for (const game of games || []) {
    const key = groupKeyFor(game)
    if (!key) {
      order.push(game)
      continue
    }
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = []
      buckets.set(key, bucket)
      order.push(bucket)
    }
    bucket.push(game)
  }
  return order.map((entry) => {
    if (!Array.isArray(entry)) return entry
    if (entry.length === 1) return entry[0]
    const ranked = [...entry].sort(
      (a, b) =>
        (Number(b.playtime_minutes) || 0) - (Number(a.playtime_minutes) || 0) ||
        timeOf(b.last_played) - timeOf(a.last_played) ||
        (Number(a.master_id) || 0) - (Number(b.master_id) || 0),
    )
    const primary = ranked[0]
    const totalPlaytime = entry.reduce((sum, row) => sum + (Number(row.playtime_minutes) || 0), 0)
    const versionPlatforms = []
    for (const row of ranked) {
      for (const p of row.platforms || []) {
        if (p && !versionPlatforms.includes(p)) versionPlatforms.push(p)
      }
    }
    const lastPlayed = ranked.reduce(
      (best, row) => (timeOf(row.last_played) > timeOf(best) ? row.last_played : best),
      null,
    )
    return {
      ...primary,
      versions: ranked,
      version_platforms: versionPlatforms,
      playtime_minutes: totalPlaytime,
      playtime_label: minutesToHhm(totalPlaytime),
      last_played: lastPlayed || primary.last_played,
    }
  })
}
