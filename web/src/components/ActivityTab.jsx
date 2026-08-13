import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import Cover from './Cover.jsx'
import GameDetail from './GameDetail.jsx'
import Skeleton from './Skeleton.jsx'
import { useLibraryGames } from '../lib/useLibraryGames.js'
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
  const days = []
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(startOfDay(now).getTime() - i * 86400000)
    const key = dayKey(d)
    days.push({
      key,
      minutes: inWindow
        .filter((r) => dayKey(eventDay(r)) === key)
        .reduce((s, r) => s + (Number(r.minutes_delta) || 0), 0),
      label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
      isToday: i === 0,
    })
  }
  return {
    minutes: inWindow.reduce((s, r) => s + (Number(r.minutes_delta) || 0), 0),
    games: new Set(inWindow.map((r) => r.master_id)).size,
    achievements: inWindow.reduce((s, r) => s + (Number(r.achievements_delta) || 0), 0),
    activeDays: new Set(inWindow.map((r) => dayKey(eventDay(r)))).size,
    days,
    span,
  }
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
          <WeekHeader week={week} />
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

      {selected ? <GameDetail game={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  )
}

function WeekHeader({ week }) {
  const peak = Math.max(...week.days.map((d) => d.minutes), 1)
  const h = Math.floor(week.minutes / 60)
  const m = week.minutes % 60

  return (
    <div className="wk">
      <div className="wk-top">
        <span className="wk-label">Last {week.span} days</span>
        <span className="wk-trend">
          {week.activeDays} of {week.span} days played
        </span>
      </div>
      <div className="wk-stats">
        <Stat value={<>{h}<span className="u">h</span> {m}<span className="u">m</span></>} label="played" />
        <Stat value={week.games} label={week.games === 1 ? 'game' : 'games'} />
        <Stat value={week.achievements} label="achievements" />
        <Stat value={week.activeDays} label="active days" />
      </div>
      <div className="wk-days">
        {week.days.map((d) => {
          // A day with any play gets a visible floor, otherwise a 12-minute session
          // next to a 6-hour one rounds to nothing and reads as a day off.
          const pct = d.minutes ? Math.max(14, Math.round((d.minutes / peak) * 100)) : 0
          return (
            <div className={`wk-day${d.isToday ? ' today' : ''}`} key={d.key}>
              <div className="wk-bar" title={d.minutes ? minutesToHhm(d.minutes) : 'Nothing played'}>
                {pct ? <div className="wk-fill" style={{ height: `${pct}%` }} /> : null}
              </div>
              <div className="wk-dname">{d.label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ value, label }) {
  return (
    <div className="wk-stat">
      <div className="wk-val">{value}</div>
      <div className="wk-key">{label}</div>
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
