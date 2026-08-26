import { dayKey, daysBetween, eventDay, startOfDay, weekStats } from './playWeek.js'

export const INSIGHT_WEEK_DAYS = 7
export const INSIGHT_MONTH_DAYS = 30
export const INSIGHT_QUERY_DAYS = INSIGHT_MONTH_DAYS * 2

const num = (value) => Number(value) || 0

function periodStart(now, span) {
  return new Date(startOfDay(now).getTime() - (span - 1) * 86400000)
}

function isInside(row, now, span) {
  const age = daysBetween(now, eventDay(row))
  return age >= 0 && age < span
}

function trendBuckets(rows, now, span, count) {
  const start = periodStart(now, span)
  const buckets = Array.from({ length: count }, (_, index) => {
    const fromOffset = Math.floor((index * span) / count)
    const toOffset = Math.floor(((index + 1) * span) / count) - 1
    const from = new Date(start.getTime() + fromOffset * 86400000)
    const to = new Date(start.getTime() + toOffset * 86400000)
    return {
      key: dayKey(from),
      from,
      to,
      label: from.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      minutes: 0,
    }
  })

  for (const row of rows) {
    if (!isInside(row, now, span)) continue
    const offset = daysBetween(eventDay(row), start)
    const index = Math.min(count - 1, Math.floor((offset * count) / span))
    buckets[index].minutes += num(row.minutes_delta)
  }
  return buckets
}

// Adds recent progress and finishes to the honest rolling-window totals from
// weekStats. A progress gain needs a reading before the period; unknown baselines
// stay unknown instead of pretending every game began at zero.
export function periodInsights(rows, now = new Date(), span = INSIGHT_WEEK_DAYS, firstRecorded = null) {
  const base = weekStats(rows || [], now, span, firstRecorded)
  const start = periodStart(now, span)
  const states = new Map()
  const ordered = [...(rows || [])].sort((a, b) => eventDay(a) - eventDay(b))

  for (const row of ordered) {
    const age = daysBetween(now, eventDay(row))
    if (age < 0) continue
    const key = String(row.master_id)
    const state = states.get(key) || {
      master_id: row.master_id,
      title: row.title,
      beforePercent: null,
      rows: [],
    }
    const percent = row.percent_after == null ? null : num(row.percent_after)
    if (eventDay(row) < start) {
      if (percent != null) state.beforePercent = percent
    } else if (age < span) {
      state.rows.push(row)
    }
    states.set(key, state)
  }

  const detailById = new Map()
  for (const state of states.values()) {
    if (!state.rows.length) continue
    const percentRows = state.rows.filter((row) => row.percent_after != null)
    const lastPercent = percentRows.length ? num(percentRows[percentRows.length - 1].percent_after) : null
    const baseline = state.beforePercent
    const progressGain = baseline != null && lastPercent != null ? Math.max(0, lastPercent - baseline) : null
    const completed = baseline != null && baseline < 100 && lastPercent != null && lastPercent >= 100
    detailById.set(String(state.master_id), {
      completed,
      baseline,
      lastPercent,
      progressGain,
      lastDay: eventDay(state.rows[state.rows.length - 1]),
    })
  }

  const byGame = base.byGame.map((game) => {
    const detail = detailById.get(String(game.master_id)) || {}
    return {
      ...game,
      ...detail,
      share: base.minutes > 0 ? game.minutes / base.minutes : 0,
    }
  })
  const completedGames = byGame.filter((game) => game.completed)
  const progressGames = byGame
    .filter((game) => game.progressGain != null && game.progressGain > 0)
    .sort((a, b) => b.progressGain - a.progressGain)
  const progressGain = progressGames.reduce((total, game) => total + game.progressGain, 0)

  const milestones = []
  for (const game of completedGames.slice(0, 1)) {
    milestones.push({ type: 'completed', master_id: game.master_id, title: `Finished ${game.title}`, game })
  }
  const progress = progressGames.find((game) => !completedGames.some((done) => done.master_id === game.master_id))
  if (progress) {
    milestones.push({
      type: 'progress',
      master_id: progress.master_id,
      title: `${progress.title} reached ${Math.round(progress.lastPercent)}%`,
      game: progress,
    })
  }
  if (base.achievements > 0) {
    milestones.push({ type: 'achievements', title: `${base.achievements} achievements unlocked` })
  }
  const bucketCount = span <= INSIGHT_WEEK_DAYS ? span : 4
  return {
    ...base,
    byGame,
    completedGames,
    progressGames,
    progressGain,
    milestones: milestones.slice(0, 3),
    buckets: trendBuckets(rows || [], now, span, bucketCount),
    comparisonDelta: base.hasPrev ? base.minutes - base.prevMinutes : null,
    comparisonPercent:
      base.hasPrev && base.prevMinutes > 0
        ? Math.round(((base.minutes - base.prevMinutes) / base.prevMinutes) * 100)
        : null,
  }
}

export function comparisonAvailableOn(firstRecorded, span) {
  if (!firstRecorded) return null
  return new Date(startOfDay(firstRecorded).getTime() + (span * 2 - 1) * 86400000)
}
