import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import Cover from './Cover.jsx'
import GameDetail from './GameDetail.jsx'
import Skeleton from './Skeleton.jsx'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { useDelayedClose } from '../lib/useDelayedClose.js'
import { useSheetDrag } from '../lib/useSheetDrag.js'
import { lockScroll } from '../lib/scrollLock.js'
import { formatRelativeDay, minutesToHhm, platformMeta, parseDayOrInstant } from '../lib/format.js'
import './activity.css'

// How far back the feed reads. A date range rather than `limit N`: the week header
// sums the rows it was given, so a row cap means a busy week silently under-reports
// its own totals. 180 days is deep enough to scroll and still one small request.
const WINDOW_DAYS = 180
// Backstop only. Ordering is event_date DESC so this truncates the OLDEST rows,
// never the recent ones the header depends on.
const MAX_ROWS = 1000
// Days between two sessions of the same game before it counts as a new run rather
// than a continuation. A week off is a new chapter, a day off is not.
const RUN_GAP_DAYS = 6
const WEEK_SPAN = 7

// Midnight local, so day arithmetic never straddles a timezone boundary.
function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function dayKey(d) {
  const x = startOfDay(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
// event_date is a Postgres `date` and arrives as a bare "2026-08-12". Parsing that
// directly gives UTC midnight, which is the previous evening west of UTC and shifts
// every label by a day; parseDayOrInstant builds it from its components instead.
function eventDay(row) {
  return startOfDay(parseDayOrInstant(row.event_date) || new Date())
}
function daysBetween(a, b) {
  return Math.round((startOfDay(a) - startOfDay(b)) / 86400000)
}

// Rolling window ending today, not a calendar week: a calendar week resets to zeros
// every Monday, which reads as "you have not played" rather than "it is Monday".
export function weekStats(rows, now = new Date(), span = WEEK_SPAN) {
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

  // Time and unlocks per game, so the sheet can say what the week was actually
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
    hasPrev: prevRows.length > 0,
    prevMinutes: minutesOf(prevRows),
    byGame,
    best: best && best.minutes > 0 ? best : null,
    avgActive: activeDays ? Math.round(minutes / activeDays) : 0,
    run: runLen > 0 ? { length: runLen, from: days[runEnd - runLen + 1], to: days[runEnd] } : null,
    platforms: [...new Set(inWindow.map((r) => r.environment).filter(Boolean))],
  }
}

// Bar labels have roughly 48px of column on a 390px phone, so "2h 12m" does not
// fit. Rounded to the nearest half hour; the feed below carries the exact figure.
function compactHm(mins) {
  const total = Math.max(0, Math.round(mins || 0))
  if (total < 60) return `${total}m`
  const h = Math.floor(total / 60)
  return total % 60 >= 30 ? `${h}.5h` : `${h}h`
}

// Continuity, computed across rows: how far into a run each row sits, and the
// completion the day started from. Everything else on a row is the row's own.
export function annotate(rows) {
  const asc = [...rows].sort((a, b) => eventDay(a) - eventDay(b))
  const prevOf = new Map()
  const out = asc.map((r) => {
    const prev = prevOf.get(r.master_id) || null
    const continued = prev && daysBetween(eventDay(r), eventDay(prev)) <= RUN_GAP_DAYS
    const row = {
      ...r,
      // With no previous event in the window we genuinely do not know where the day
      // began, so the arc shows the day's own figure rather than inventing a zero.
      pctFrom: continued ? Number(prev.percent_after) : null,
      dayN: continued ? prev.dayN + 1 : 1,
    }
    prevOf.set(r.master_id, row)
    return row
  })
  // v_recent_activity orders by event_date DESC, minutes_delta DESC. Reversing the
  // ascending pass gets the days right but flips games WITHIN a day, so the view's
  // ordering is reapplied rather than assumed.
  return out.sort(
    (a, b) => eventDay(b) - eventDay(a) || (Number(b.minutes_delta) || 0) - (Number(a.minutes_delta) || 0)
  )
}

export default function ActivityTab() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [weekOpen, setWeekOpen] = useState(false)
  const mountedRef = useRef(true)
  // The feed carries master_id; the sheet needs the whole game row. This is the same
  // session-cached library fetch every other surface uses, so it is usually free.
  const { games } = useLibraryGames()

  const gamesById = useMemo(() => {
    const m = new Map()
    for (const g of games) m.set(g.master_id, g)
    return m
  }, [games])

  async function loadEvents() {
    const since = dayKey(new Date(Date.now() - WINDOW_DAYS * 86400000))
    const { data, error: err } = await supabase
      .from('v_recent_activity')
      .select('*')
      .gte('event_date', since)
      .order('event_date', { ascending: false })
      .limit(MAX_ROWS)

    if (!mountedRef.current) return
    if (err) setError(err.message)
    else {
      setEvents(data || [])
      setError(null)
    }
  }

  useEffect(() => {
    mountedRef.current = true
    ;(async () => {
      setLoading(true)
      await loadEvents()
      if (mountedRef.current) setLoading(false)
    })()
    return () => {
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = useMemo(() => annotate(events), [events])
  const week = useMemo(() => weekStats(events), [events])

  const grouped = useMemo(() => {
    const groups = []
    const byLabel = new Map()
    for (const row of rows) {
      const label = formatRelativeDay(row.event_date)
      if (!byLabel.has(label)) {
        const group = { label, items: [] }
        byLabel.set(label, group)
        groups.push(group)
      }
      byLabel.get(label).items.push(row)
    }
    return groups
  }, [rows])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Activity</h1>
        <p className="page-subtitle">Recent play sessions and achievement unlocks.</p>
      </div>

      {loading ? (
        <Skeleton count={6} />
      ) : error ? (
        <div className="empty-state">
          <div className="empty-state-title">Couldn't load activity</div>
          <div>{error}</div>
        </div>
      ) : grouped.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">Nothing here yet</div>
          <div>Your play history builds up daily, check back soon.</div>
        </div>
      ) : (
        <>
          <WeekHeader week={week} onOpen={() => setWeekOpen(true)} />
          {grouped.map((group) => (
            <section key={group.label}>
              <div className="activity-group-label">{group.label}</div>
              <div className="tl">
                {group.items.map((row, idx) => (
                  <ActivityRow
                    key={`${row.master_id}-${row.event_date}-${idx}`}
                    row={row}
                    game={gamesById.get(row.master_id) || null}
                    onOpen={setSelected}
                  />
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {weekOpen ? (
        <WeekSheet
          week={week}
          gamesById={gamesById}
          onClose={() => setWeekOpen(false)}
          // The game sheet replaces the week sheet rather than stacking on it:
          // two backdrops deep, the top one's scrim darkens the one below and the
          // back gesture only unwinds one layer.
          onOpenGame={(g) => {
            setWeekOpen(false)
            setSelected(g)
          }}
        />
      ) : null}

      {selected ? <GameDetail game={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  )
}

// Bar heights in px against a fixed track rather than a percentage of it, so the
// floor for a short session is 4px of ink instead of 14% of the scale. The old
// floor drew a 2h day at nearly half the height of a 6h one.
const BAR_TRACK = 34
const SHEET_TRACK = 74

function bars(days, peak, track) {
  return days.map((d) => ({
    ...d,
    h: d.minutes ? Math.max(4, Math.round((d.minutes / peak) * track)) : 0,
    isPeak: d.minutes > 0 && d.minutes === peak,
  }))
}

function WeekHeader({ week, onOpen }) {
  const peak = Math.max(...week.days.map((d) => d.minutes), 1)
  const delta = week.hasPrev ? week.minutes - week.prevMinutes : null

  return (
    <button type="button" className="wk" onClick={onOpen} aria-label={`Week detail, ${minutesToHhm(week.minutes)} played`}>
      <div className="wk-top">
        <span className="wk-label">Last {week.span} days</span>
        <span className="wk-right">
          {delta === null ? null : delta === 0 ? (
            <span className="wk-delta flat">Level with last week</span>
          ) : (
            <span className="wk-delta">
              {delta > 0 ? '↑' : '↓'} {minutesToHhm(Math.abs(delta))}
            </span>
          )}
          <span className="wk-chev" aria-hidden="true">
            &rsaquo;
          </span>
        </span>
      </div>

      <div className="wk-hero">
        <span className="wk-big">{hhmParts(week.minutes)}</span>
        <span className="wk-played">played</span>
      </div>

      {/* One line, three facts, each stated exactly once. The 4-up stat grid this
          replaces could never line up: "15h 54m" is three times the width of "2". */}
      <div className="wk-meta">
        <span>
          <b>{week.games}</b> {week.games === 1 ? 'game' : 'games'}
        </span>
        <span className="wk-dot">·</span>
        <span>
          <b>{week.achievements}</b> {week.achievements === 1 ? 'achievement' : 'achievements'}
        </span>
        <span className="wk-dot">·</span>
        <span>
          <b>{week.activeDays}</b> of {week.span} days
        </span>
      </div>

      <div className="wk-chart">
        {bars(week.days, peak, BAR_TRACK).map((d) => (
          <div className="wk-col" key={d.key}>
            <span className={`wk-cap${d.isPeak ? ' peak' : ''}`}>{d.isPeak ? minutesToHhm(d.minutes) : ''}</span>
            <span className="wk-track">
              {/* An empty day is empty. The old track was filled with --surface-2,
                  which in light mode is BRIGHTER than the card, so a day with
                  nothing played drew as the most prominent block in the header. */}
              <span
                className={`wk-fill${d.isPeak ? ' peak' : ''}${d.minutes ? '' : d.isToday ? ' today-empty' : ' zero'}`}
                style={d.minutes ? { height: `${d.h}px` } : undefined}
              />
            </span>
          </div>
        ))}
      </div>
      <div className="wk-names">
        {week.days.map((d) => (
          <span className={`wk-name${d.isToday ? ' today' : ''}`} key={d.key}>
            {d.label}
          </span>
        ))}
      </div>
    </button>
  )
}

function WeekSheet({ week, gamesById, onClose, onOpenGame }) {
  const peak = Math.max(...week.days.map((d) => d.minutes), 1)
  const topMinutes = Math.max(week.byGame[0]?.minutes || 0, 1)
  const delta = week.hasPrev ? week.minutes - week.prevMinutes : null
  const first = week.days[0]
  const last = week.days[week.days.length - 1]
  const range = (d) => parseDayOrInstant(d.key).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

  // Same close path as every other sheet in the app: exit animation, swipe down
  // to dismiss, and the background locked while it is open.
  const { closing, requestClose } = useDelayedClose(onClose)
  const { dragY, dragging, handlers: dragHandlers } = useSheetDrag(requestClose)

  useEffect(() => lockScroll(), [])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && requestClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className={`modal-backdrop${closing ? ' closing' : ''}`}
      onClick={(e) => e.target === e.currentTarget && requestClose()}
    >
      <div
        className="modal-sheet wk-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Week detail"
        style={{
          transform: closing ? 'translateY(110%)' : dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? 'none' : 'transform 0.2s ease',
        }}
      >
        {/* Drag zone is the grabber plus the title block: neither scrolls and
            neither holds a control, so preventDefault on move cannot eat the
            sheet's own scrolling or swallow a tap on the close button. */}
        <div className="wks-grab sheet-drag-zone" {...dragHandlers}>
          <div className="modal-handle" />
        </div>

        <div className="wks-top">
          <div className="wks-th sheet-drag-zone" {...dragHandlers}>
            <div className="detail-title">Last {week.span} days</div>
            <div className="wks-range">
              {range(first)} to {range(last)}
            </div>
          </div>
          <button type="button" className="wks-x" onClick={requestClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="wks-hero">
          <span className="wks-big">{hhmParts(week.minutes)}</span>
          {delta === null ? null : (
            <span className={`wks-delta${delta === 0 ? ' flat' : ''}`}>
              {delta === 0
                ? `Level with the previous ${week.span} days`
                : `${delta > 0 ? '↑' : '↓'} ${minutesToHhm(Math.abs(delta))} vs the previous ${week.span} days`}
            </span>
          )}
        </div>

        <div className="wks-sec">By day</div>
        <div className="wks-card">
          {/* Every bar carries its own value. The header used a `title` tooltip,
              which never fires on iOS, where this app actually gets used. */}
          <div className="wks-chart">
            {bars(week.days, peak, SHEET_TRACK).map((d) => (
              <div className="wks-col" key={d.key}>
                <span className={`wks-v${d.minutes ? '' : ' off'}`}>{d.minutes ? compactHm(d.minutes) : '·'}</span>
                <span className="wks-track">
                  <span
                    className={`wks-fill${d.isPeak ? ' peak' : ''}${d.minutes ? '' : ' zero'}`}
                    style={d.minutes ? { height: `${d.h}px` } : undefined}
                  />
                </span>
              </div>
            ))}
          </div>
          <div className="wks-days">
            {week.days.map((d) => (
              <span className={`wks-day${d.isToday ? ' today' : ''}`} key={d.key}>
                {/* Full names, because 'narrow' gives S/S and T/T. */}
                {d.short}
              </span>
            ))}
          </div>
        </div>

        {week.byGame.length ? (
          <>
            <div className="wks-sec">What you played</div>
            <div className="wks-card">
              {week.byGame.map((g) => {
                const game = gamesById.get(g.master_id) || null
                const cover = game ? game.cover_standard || game.cover_small || g.cover : g.cover
                return (
                  <button
                    type="button"
                    className={`wks-game${game ? '' : ' flat'}`}
                    key={g.master_id}
                    onClick={game ? () => onOpenGame(game) : undefined}
                  >
                    <Cover src={cover} title={g.title} size="sm" />
                    <span className="wks-gb">
                      <span className="wks-gn">{g.title}</span>
                      <span className="wks-gs">
                        {g.days} {g.days === 1 ? 'day' : 'days'}
                        {g.achievements > 0
                          ? ` · ${g.achievements} ${g.achievements === 1 ? 'achievement' : 'achievements'}`
                          : ''}
                      </span>
                      <span className="wks-gtrack">
                        <span className="wks-gfill" style={{ width: `${Math.round((g.minutes / topMinutes) * 100)}%` }} />
                      </span>
                    </span>
                    <span className="wks-gt">{minutesToHhm(g.minutes)}</span>
                  </button>
                )
              })}
            </div>
          </>
        ) : null}

        <div className="wks-sec">Detail</div>
        <div className="wks-card">
          {week.best ? (
            <div className="wks-kv">
              <span className="k">Best day</span>
              <span className="v">
                {week.best.short}, {minutesToHhm(week.best.minutes)}
              </span>
            </div>
          ) : null}
          {week.activeDays > 0 ? (
            <div className="wks-kv">
              <span className="k">Average per active day</span>
              <span className="v">{minutesToHhm(week.avgActive)}</span>
            </div>
          ) : null}
          {week.run ? (
            <div className="wks-kv">
              <span className="k">Longest run</span>
              <span className="v">
                {week.run.length} {week.run.length === 1 ? 'day' : 'days'}
                {week.run.length > 1 ? `, ${week.run.from.short} to ${week.run.to.short}` : `, ${week.run.from.short}`}
              </span>
            </div>
          ) : null}
          <div className="wks-kv">
            <span className="k">Achievements</span>
            <span className="v">{week.achievements}</span>
          </div>
          {week.platforms.length ? (
            <div className="wks-kv">
              <span className="k">{week.platforms.length === 1 ? 'Platform' : 'Platforms'}</span>
              <span className="v">{week.platforms.map((p) => platformMeta(p).label).join(', ')}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// "2h 42m" with the units styled down. Split from minutesToHhm's output rather than
// reformatted here, so there is still one definition of how a duration reads.
function hhmParts(mins) {
  return minutesToHhm(mins)
    .split(' ')
    .map((part, i) => {
      const m = /^(\d+)([hm])$/.exec(part)
      if (!m) return <span key={i}>{part}</span>
      return (
        <span key={i}>
          {i > 0 ? ' ' : null}
          {m[1]}
          <span className="u">{m[2]}</span>
        </span>
      )
    })
}

function ActivityRow({ row, game, onOpen }) {
  const { label, color } = platformMeta(row.environment)
  const pctTo = Number(row.percent_after) || 0
  const from = row.pctFrom == null ? 0 : row.pctFrom
  const gain = Math.max(pctTo - from, 0)
  const continued = row.dayN > 1
  const ach = Number(row.achievements_delta) || 0
  const mins = Number(row.minutes_delta) || 0

  const cover = game
    ? game.cover_standard || game.cover_small || row.cover_small
    : row.cover_small

  return (
    <button
      type="button"
      className={`activity-row${continued ? ' cont' : ''}${game ? '' : ' flat'}`}
      onClick={game ? () => onOpen(game) : undefined}
      aria-label={game ? `Open ${row.title}` : undefined}
    >
      <span className="activity-node" />
      <Cover src={cover} title={row.title} size="sm" />
      <div className="activity-body">
        <div className="activity-head">
          <span className="activity-title">{row.title}</span>
          {continued ? <span className="activity-chip">Day {row.dayN}</span> : null}
          {mins > 0 ? <span className="activity-mins">{hhmParts(mins)}</span> : null}
        </div>
        <div className="activity-detail">
          <span className="platform-dot" style={{ background: color }} />
          {label}
          {ach > 0 ? (
            <>
              <span className="activity-sep">·</span>
              {`+${ach} ${ach === 1 ? 'achievement' : 'achievements'}`}
            </>
          ) : null}
          {row.total_awards > 0 ? (
            <>
              <span className="activity-sep">·</span>
              {`${row.earned_awards_after ?? 0} of ${row.total_awards}`}
            </>
          ) : null}
        </div>
        {pctTo > 0 ? (
          <div className="activity-arc">
            <div className="arc-track">
              <span className="arc-base" style={{ width: `${from}%` }} />
              <span className="arc-gain" style={{ left: `${from}%`, width: `${gain}%` }} />
            </div>
            <span className="arc-txt">
              {row.pctFrom == null ? (
                <>
                  <b>{pctTo}%</b> complete
                </>
              ) : (
                <>
                  {row.pctFrom}% → <b>{pctTo}%</b>
                </>
              )}
            </span>
          </div>
        ) : null}
      </div>
    </button>
  )
}
