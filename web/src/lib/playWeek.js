import { parseDayOrInstant } from './format.js'

// Day arithmetic and the rolling-week rollup, shared by the Activity feed (which
// groups rows into days) and Insights (which draws the week block). Pure: no
// React, no supabase, so it can be exercised directly.

export const WEEK_SPAN = 7

// Midnight local, so day arithmetic never straddles a timezone boundary.
export function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function dayKey(d) {
  const x = startOfDay(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

// event_date is a Postgres `date` and arrives as a bare "2026-08-12". Parsing that
// directly gives UTC midnight, which is the previous evening west of UTC and shifts
// every label by a day; parseDayOrInstant builds it from its components instead.
export function eventDay(row) {
  return startOfDay(parseDayOrInstant(row.event_date) || new Date())
}

export function daysBetween(a, b) {
  return Math.round((startOfDay(a) - startOfDay(b)) / 86400000)
}

// Bar labels have roughly 48px of column on a 390px phone, so "2h 12m" does not
// fit. Rounded to the nearest half hour; the feed carries the exact figure.
export function compactHm(mins) {
  const total = Math.max(0, Math.round(mins || 0))
  if (total < 60) return `${total}m`
  const hrs = Math.floor(total / 60)
  return total % 60 >= 30 ? `${hrs}.5h` : `${hrs}h`
}

// Rolling window ending today, not a calendar week: a calendar week resets to zeros
// every Monday, which reads as "you have not played" rather than "it is Monday".
// `firstRecorded` is the earliest day the history holds AT ALL, not the earliest
// day in `rows`. Without it the week-over-week line is computed over a window the
// data only partly covers: on 18 Aug 2026 the preceding window ran 5 to 11 Aug
// while play_events began on the 7th, so it held 594 minutes across 3 days and
// the card would have announced a rise of 11h 20m that was really four missing
// days. Pass it and the comparison waits until it can be honest.
export function weekStats(rows, now = new Date(), span = WEEK_SPAN, firstRecorded = null) {
  const inWindow = rows.filter((r) => {
    const d = daysBetween(now, eventDay(r))
    return d >= 0 && d < span
  })
  // The span immediately before this one, for the week-over-week line. Kept as the
  // rows rather than just a total: an EMPTY preceding window and a preceding window
  // that genuinely logged zero minutes are different claims, and only the second one
  // may be compared against. play_events starts 2026-08-08, so early windows have no
  // predecessor at all and must not be reported as a gain over nothing.
  const prevRows = rows.filter((r) => {
    const d = daysBetween(now, eventDay(r))
    return d >= span && d < span * 2
  })
  // The first day of the preceding window. The comparison is only meaningful if
  // the history reaches back to it, so an unknown start date is treated as not
  // covered rather than assumed fine.
  const prevStart = new Date(startOfDay(now).getTime() - (span * 2 - 1) * 86400000)
  const prevCovered = Boolean(firstRecorded) && startOfDay(firstRecorded) <= prevStart

  const minutesOf = (list) => list.reduce((s, r) => s + (Number(r.minutes_delta) || 0), 0)

  const days = []
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(startOfDay(now).getTime() - i * 86400000)
    const key = dayKey(d)
    const rowsToday = inWindow.filter((r) => dayKey(eventDay(r)) === key)
    days.push({
      key,
      minutes: minutesOf(rowsToday),
      // Active means "something happened", which is not the same as "minutes were
      // logged": a day can unlock an achievement without the playtime stat moving.
      // The bars chart minutes; the run counter and activeDays count events.
      active: rowsToday.length > 0,
      label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
      short: d.toLocaleDateString(undefined, { weekday: 'short' }),
      isToday: i === 0,
    })
  }

  // Time and unlocks per game, so the block can say what the week was actually
  // spent on. Deltas only, never a lifetime total: the Library owns those, and a
  // second copy here is a second thing that can disagree.
  const gameMap = new Map()
  for (const r of inWindow) {
    const cur = gameMap.get(r.master_id) || {
      master_id: r.master_id,
      title: r.title,
      environment: r.environment,
      cover: r.cover_small || null,
      minutes: 0,
      achievements: 0,
      dayKeys: new Set(),
    }
    cur.minutes += Number(r.minutes_delta) || 0
    cur.achievements += Number(r.achievements_delta) || 0
    cur.dayKeys.add(dayKey(eventDay(r)))
    gameMap.set(r.master_id, cur)
  }
  const byGame = [...gameMap.values()]
    .map(({ dayKeys, ...g }) => ({ ...g, days: dayKeys.size }))
    .sort((a, b) => b.minutes - a.minutes || b.achievements - a.achievements)

  // Longest unbroken stretch of active days inside the window.
  let run = 0
  let runLen = 0
  let runEnd = -1
  days.forEach((d, i) => {
    if (!d.active) {
      run = 0
      return
    }
    run += 1
    if (run > runLen) {
      runLen = run
      runEnd = i
    }
  })

  const minutes = minutesOf(inWindow)
  const activeDays = new Set(inWindow.map((r) => dayKey(eventDay(r)))).size
  const best = days.reduce((a, b) => (b.minutes > a.minutes ? b : a), days[0])

  return {
    minutes,
    games: new Set(inWindow.map((r) => r.master_id)).size,
    achievements: inWindow.reduce((s, r) => s + (Number(r.achievements_delta) || 0), 0),
    activeDays,
    days,
    span,
    // Both conditions, not either: a covered window that logged nothing is a real
    // zero and may be compared against, an uncovered one may not.
    hasPrev: prevCovered && prevRows.length > 0,
    prevCovered,
    prevStart,
    prevMinutes: minutesOf(prevRows),
    byGame,
    best: best && best.minutes > 0 ? best : null,
    avgActive: activeDays ? Math.round(minutes / activeDays) : 0,
    run: runLen > 0 ? { length: runLen, from: days[runEnd - runLen + 1], to: days[runEnd] } : null,
    platforms: [...new Set(inWindow.map((r) => r.environment).filter(Boolean))],
  }
}

// Bar heights in px against a fixed track rather than a percentage of it, so the
// floor for a short session is 4px of ink instead of 14% of the scale. A percentage
// floor drew a 2h day at nearly half the height of a 6h one.
export function bars(days, track) {
  const peak = Math.max(...days.map((d) => d.minutes), 1)
  return days.map((d) => ({
    ...d,
    h: d.minutes ? Math.max(4, Math.round((d.minutes / peak) * track)) : 0,
    isPeak: d.minutes > 0 && d.minutes === peak,
  }))
}
