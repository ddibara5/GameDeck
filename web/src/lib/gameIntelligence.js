// Shared evidence model for recommendation surfaces. This file is deliberately
// browser-free so both the For You client and the Ask GameDeck server can build
// taste from the same recent-play and ranking semantics.

const DAY_MS = 24 * 60 * 60 * 1000

function idKey(value) {
  return value == null ? '' : String(value)
}

function eventTime(value) {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : 0
}

export function summarizeRecentActivity(events) {
  const byGame = new Map()
  const activeDays = new Set()

  for (const event of events || []) {
    const key = idKey(event?.master_id)
    if (!key) continue
    const day = String(event?.event_date || '').slice(0, 10)
    if (day) activeDays.add(day)
    const current = byGame.get(key) || {
      minutes: 0,
      achievements: 0,
      activeDays: new Set(),
      lastPlayed: null,
    }
    current.minutes += Math.max(0, Number(event?.minutes_delta) || 0)
    current.achievements += Math.max(0, Number(event?.achievements_delta) || 0)
    if (day) current.activeDays.add(day)
    if (eventTime(event?.event_date) >= eventTime(current.lastPlayed)) {
      current.lastPlayed = event?.event_date || current.lastPlayed
    }
    byGame.set(key, current)
  }

  return { byGame, activeDayCount: activeDays.size }
}

export function buildTasteProfile({ games, ranks, activity, wishlist }) {
  const rankByGame = new Map((ranks || []).map((rank) => [idKey(rank?.master_id), rank]))
  const recent = summarizeRecentActivity(activity)
  const rows = (games || []).map((game) => {
    const played = recent.byGame.get(idKey(game?.master_id))
    return {
      ...game,
      personalRank: rankByGame.get(idKey(game?.master_id)) || null,
      recent_minutes: played?.minutes || 0,
      recent_active_days: played?.activeDays.size || 0,
      recent_last_played: played?.lastPlayed || null,
    }
  })

  return {
    rows,
    evidence: {
      recentGameCount: rows.filter((game) => game.recent_minutes > 0).length,
      recentMinutes: rows.reduce((sum, game) => sum + game.recent_minutes, 0),
      activeDayCount: recent.activeDayCount,
      rankedGameCount: (ranks || []).filter((rank) => rank?.reaction).length,
      wishlistCount: (wishlist || []).length,
    },
  }
}

export function derivedEvidenceStatus(game, explicitStatus, now = Date.now()) {
  if (explicitStatus) return explicitStatus
  const playedAt = Date.parse(game?.last_played || '')
  const minutes = Math.max(0, Number(game?.playtime_minutes) || 0)
  if (!Number.isFinite(playedAt) && minutes === 0) return 'backlog'
  const length = Math.max(0, Number(game?.length_minutes) || 0)
  if (length && minutes >= length) return 'finished'
  if (Number.isFinite(playedAt) && now - playedAt <= 21 * DAY_MS) return 'playing'
  return 'backlog'
}
