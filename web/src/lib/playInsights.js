import { dayKey, daysBetween, eventDay, startOfDay, weekStats } from './playWeek.js'

export const INSIGHT_WEEK_DAYS = 7
export const INSIGHT_MONTH_DAYS = 30
export const INSIGHT_GENRE_DAYS = 90
export const INSIGHT_QUERY_DAYS = Math.max(INSIGHT_MONTH_DAYS * 2, INSIGHT_GENRE_DAYS)

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

  const bucketCount = span <= INSIGHT_WEEK_DAYS ? span : 4
  return {
    ...base,
    byGame,
    completedGames,
    progressGames,
    progressGain,
    buckets: trendBuckets(rows || [], now, span, bucketCount),
    comparisonDelta: base.hasPrev ? base.minutes - base.prevMinutes : null,
    comparisonPercent:
      base.hasPrev && base.prevMinutes > 0
        ? Math.round(((base.minutes - base.prevMinutes) / base.prevMinutes) * 100)
        : null,
  }
}

// One primary genre per library game keeps the pie mutually exclusive. The top
// four remain named and the long tail (plus missing genres) rolls into Other, so
// the mobile legend stays readable and every slice still sums to the period.
export function genreInsights(rows, games, now = new Date(), span = INSIGHT_GENRE_DAYS, namedLimit = 4) {
  const genreByGame = new Map(
    (games || []).map((game) => [String(game.master_id), String(game.genre || '').trim() || 'Other']),
  )
  const totals = new Map()

  for (const row of rows || []) {
    if (!isInside(row, now, span)) continue
    const minutes = Math.max(0, num(row.minutes_delta))
    if (!minutes) continue
    const genre = genreByGame.get(String(row.master_id)) || 'Other'
    totals.set(genre, (totals.get(genre) || 0) + minutes)
  }

  const named = [...totals.entries()]
    .filter(([genre]) => genre !== 'Other')
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const top = named.slice(0, namedLimit)
  const otherMinutes = (totals.get('Other') || 0) + named.slice(namedLimit).reduce((sum, [, minutes]) => sum + minutes, 0)
  if (otherMinutes > 0) top.push(['Other', otherMinutes])

  const totalMinutes = top.reduce((sum, [, minutes]) => sum + minutes, 0)
  return top.map(([genre, minutes]) => ({
    genre,
    minutes,
    share: totalMinutes > 0 ? minutes / totalMinutes : 0,
  }))
}

export function comparisonAvailableOn(firstRecorded, span) {
  if (!firstRecorded) return null
  return new Date(startOfDay(firstRecorded).getTime() + (span * 2 - 1) * 86400000)
}
