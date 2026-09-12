// Home tab's week aggregation and Now Playing selection.
//
// A direct port of the Expo pilot's lib/insights.ts (loadInsights(7)) and the
// currentPlay() selector from its home screen, reading the web's
// v_recent_activity rows (lib/recentActivity.js) instead of the pilot's
// play_events-based loadActivity. The pilot helpers it depends on
// (percentage, storyProgress, gameArtworkUrl) are ported here too so the
// selection logic stays byte-for-byte comparable to the pilot.
//
// Pure: no React, no supabase, so it can be exercised directly in tests.

import { dayKey, eventDay, startOfDay } from './playWeek.js'

export const HOME_ACTIVITY_DAYS = 7

function nonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

// Pilot lib/progress.ts, exact port.
export function percentage(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.min(Math.max(value, 0), 100)) : null
}

// Pilot lib/progress.ts, exact port.
export function storyProgress(minutes, length) {
  if (typeof length !== 'number' || !Number.isFinite(length) || length <= 0) return null
  return percentage((Math.max(minutes ?? 0, 0) / length) * 100)
}

const IGDB_COVER_ID = /^co[a-z0-9]+$/i

function httpsUrl(value) {
  if (!value) return null
  try {
    const url = new URL(String(value).trim())
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

// Pilot lib/artwork.ts, exact port: GameDeck stores IGDB cover IDs (for
// example, "co39vc") rather than CDN URLs. A valid HTTPS standard cover is the
// fallback.
export function gameArtworkUrl(coverIgdb, coverStandard) {
  const igdbValue = coverIgdb && String(coverIgdb).trim()
  if (igdbValue && IGDB_COVER_ID.test(igdbValue)) {
    return `https://images.igdb.com/igdb/image/upload/t_cover_big/${igdbValue}.jpg`
  }
  return httpsUrl(coverIgdb) ?? httpsUrl(coverStandard)
}

// Map a v_recent_activity row onto the pilot ActivityItem fields Home needs.
// eventDate is the local YYYY-MM-DD day key, matching the pilot's key().
export function toHomeActivityItem(row) {
  const percent = Number(row.percent_after)
  const progress = percentage(Number.isFinite(percent) ? percent : null)
  return {
    id: String(row.master_id ?? row.id ?? ''),
    masterId: row.master_id ?? null,
    title: row.title ?? '',
    environment: row.environment ?? null,
    eventDate: dayKey(eventDay(row)),
    minutes: nonNegative(row.minutes_delta),
    achievements: nonNegative(row.achievements_delta),
    percent: progress,
    // Activity rows carry no story length, so their progress is achievement
    // completion. This only surfaces on the fallback path, when the game is
    // missing from the library entirely.
    progress,
    progressLabel: progress !== null ? 'Achievement completion' : null,
    artwork: gameArtworkUrl(null, row.cover_small),
  }
}

// Port of the pilot's loadInsights(7) aggregation: bucket the last 7 local days,
// sum minutes/achievements, count active days and distinct games, top 5 by minutes.
export function summarizeWeekActivity(rows, today = new Date()) {
  const start = startOfDay(today)
  const dates = Array.from({ length: HOME_ACTIVITY_DAYS }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() - (HOME_ACTIVITY_DAYS - 1 - index))
    return date
  })
  const allowed = new Set(dates.map((date) => dayKey(date)))
  const items = (rows || []).map(toHomeActivityItem).filter((item) => allowed.has(item.eventDate))

  const minutesByDay = new Map()
  const games = new Map()
  let achievements = 0
  for (const item of items) {
    minutesByDay.set(item.eventDate, (minutesByDay.get(item.eventDate) ?? 0) + item.minutes)
    achievements += item.achievements
    const key = String(item.masterId ?? item.id)
    const row = games.get(key) ?? { item, minutes: 0, dates: new Set() }
    row.minutes += item.minutes
    row.dates.add(item.eventDate)
    games.set(key, row)
  }

  const days = dates.map((date) => {
    const key = dayKey(date)
    return { key, minutes: minutesByDay.get(key) ?? 0 }
  })

  return {
    days,
    minutes: items.reduce((sum, item) => sum + item.minutes, 0),
    achievements,
    activeDays: days.filter((day) => day.minutes > 0).length,
    gameCount: games.size,
    games: [...games.values()]
      .map((row) => ({ item: row.item, minutes: row.minutes, days: row.dates.size }))
      .sort((left, right) => right.minutes - left.minutes)
      .slice(0, 5),
  }
}

// Port of the pilot home screen's currentPlay(): the most recently played
// library game (valid last_played, sorted desc), with weekly minutes joined
// from the insights snapshot. Falls back to the latest insights row when no
// library game qualifies, hiding the lifetime total like the pilot does.
export function currentPlay(games, insights) {
  const game = (games || [])
    .filter((item) => item.last_played && Number.isFinite(Date.parse(item.last_played)))
    .sort((a, b) => Date.parse(b.last_played) - Date.parse(a.last_played))[0]
  if (game) {
    const recorded = insights?.games.find(({ item }) => item.masterId === game.master_id)
    const story = storyProgress(game.playtime_minutes, game.length_minutes)
    const progress = story ?? percentage(game.percent)
    return {
      item: {
        id: String(game.master_id),
        masterId: game.master_id,
        title: game.title,
        environment: game.platforms?.[0] ?? null,
        eventDate: game.last_played,
        minutes: 0,
        achievements: 0,
        percent: percentage(game.percent),
        artwork: gameArtworkUrl(game.cover_igdb, game.cover_standard),
        progress,
        progressLabel: story !== null ? 'Story progress' : 'Achievement completion',
      },
      weeklyMinutes: recorded?.minutes ?? null,
      totalMinutes: game.playtime_minutes,
      // The library row the detail sheet opens. Null on the fallback path, where
      // the card is informational rather than tappable.
      game,
    }
  }
  const recorded = insights?.games.toSorted((a, b) => b.item.eventDate.localeCompare(a.item.eventDate))[0]
  return recorded
    ? { item: recorded.item, weeklyMinutes: recorded.minutes, totalMinutes: null, game: null }
    : null
}
