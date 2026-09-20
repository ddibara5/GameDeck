import { parseDayOrInstant } from './format.js'

export function activityDate(value, now = new Date()) {
  const date = value ? parseDayOrInstant(value) : null
  if (!date || !Number.isFinite(date.getTime())) return { weekday: 'Unknown date', date: '' }
  return {
    weekday: date.toLocaleDateString('en-US', { weekday: 'long' }),
    date: date.toLocaleDateString('en-US', {
      month: 'long', day: 'numeric',
      ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
    }),
  }
}

// History uses the event's snapshots, never today's library playtime/percent.
export function activityProgress(row, game) {
  const minutes = row.playtime_minutes_after
  const length = Number(game?.length_minutes)
  const story = minutes != null && Number.isFinite(Number(minutes)) && length > 0
  const value = story ? Number(minutes) / length * 100 : row.percent_after
  if (value == null || !Number.isFinite(Number(value))) return null
  return {
    percent: Math.round(Math.max(0, Math.min(100, Number(value)))),
    label: story ? 'Estimated story progress' : 'Achievement completion',
  }
}
