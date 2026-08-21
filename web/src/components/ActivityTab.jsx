import { useEffect, useMemo, useRef, useState } from 'react'
import Cover from './Cover.jsx'
import Hhm from './Hhm.jsx'
import GameDetail from './GameDetail.jsx'
import Skeleton from './Skeleton.jsx'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { fetchRecentActivity } from '../lib/recentActivity.js'
import { eventDay, daysBetween } from '../lib/playWeek.js'
import { formatRelativeDay, platformMeta } from '../lib/format.js'
import './activity.css'

// How far back the feed reads. Deep enough to scroll for a while, still one small
// request. Insights reads the same view over its own, much shorter window.
const WINDOW_DAYS = 180
// Backstop only. Ordering is event_date DESC, so this truncates the OLDEST rows and
// the top of the feed is never the thing that gets cut.
const MAX_ROWS = 1000
// Days between two sessions of the same game before it counts as a new run rather
// than a continuation. A week off is a new chapter, a day off is not.
const RUN_GAP_DAYS = 6

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
    const { data, error: err } = await fetchRecentActivity({ days: WINDOW_DAYS, limit: MAX_ROWS })

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

function ActivityRow({ row, game, onOpen }) {
  const { label, color } = platformMeta(row.environment)
  const pctTo = Number(row.percent_after) || 0
  const from = row.pctFrom == null ? 0 : row.pctFrom
  const gain = Math.max(pctTo - from, 0)
  const continued = row.dayN > 1
  const ach = Number(row.achievements_delta) || 0
  const mins = Number(row.minutes_delta) || 0

  const cover = game
    ? game.cover_small || row.cover_small
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
          {mins > 0 ? <span className="activity-mins"><Hhm mins={mins} /></span> : null}
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
