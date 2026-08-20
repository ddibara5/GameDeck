import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import Cover from './Cover.jsx'
import Skeleton from './Skeleton.jsx'
import GameDetail from './GameDetail.jsx'
import CustomizeHome from './CustomizeHome.jsx'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { useStatusMap } from '../lib/userStatus.js'
import { useHomeCards, CARD_BY_KEY } from '../lib/homeCards.js'
import { backlogGames, pickUpNext, skipGame, pickReason, pickMeta, TIER_SUB } from '../lib/homePicks.js'
import { platformMeta, minutesToHhm, parseDayOrInstant } from '../lib/format.js'
import { fetchRecentActivity } from '../lib/recentActivity.js'
import { weekStats, WEEK_SPAN, startOfDay, daysBetween, dayKey, eventDay } from '../lib/playWeek.js'
import './insights.css'
import './home.css'

// The landing screen. It answers three questions and then stops: what am I in
// the middle of, what expires, what should I start. Anything that reads the same
// next Tuesday belongs on Insights, which is why the lifetime cards are not here
// and why this page ends on the customize button rather than scrolling forever.
//
// Now playing, Coming up, Leaving Game Pass and the week totals MOVED here from
// Insights rather than being copied: their catalog keys are gone from
// insightsCards.js, so nothing renders twice.

const num = (v) => Number(v) || 0

const SHORT_GENRE = {
  'Role-playing (RPG)': 'RPG',
  'Hack and slash/Beat ’em up': 'Hack & slash',
  "Hack and slash/Beat 'em up": 'Hack & slash',
  'Real Time Strategy (RTS)': 'RTS',
  'Point-and-click': 'Point & click',
  'Card & Board Game': 'Card/Board',
}
const shortGenre = (g) => SHORT_GENRE[g] || g

// Two windows of activity: one for the week block, one before it so the arc has
// something to draw.
const ACTIVITY_DAYS = WEEK_SPAN * 2

/* ------------------------------------------------------------- progress arc */

// Completion over the recorded window for the game in progress. A plain
// polyline, not a chart component: one series, no axes, no interaction.
function Arc({ points }) {
  const W = 300, PAD = 8
  const top = 10, base = 48
  const max = Math.max(5, ...points.map((p) => p.pct))
  const step = points.length > 1 ? (W - 2 * PAD) / (points.length - 1) : 0
  const X = (i) => PAD + i * step
  const Y = (p) => base - (p / max) * (base - top)
  const d = points.map((p, i) => `${X(i)},${Y(p.pct)}`).join(' ')
  const last = points[points.length - 1]
  return (
    <svg className="ins-arc" viewBox="0 0 300 62" role="img" aria-label="Completion over the recorded window">
      <line x1={PAD} y1={base} x2={W - PAD} y2={base} stroke="var(--line)" strokeWidth="1" />
      <polyline fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={d} />
      <circle cx={X(points.length - 1)} cy={Y(last.pct)} r="3" fill="var(--accent)" />
      <text x={PAD} y="60" fontSize="8" fill="var(--muted)">{points[0].label} · {Math.round(points[0].pct)}%</text>
      <text x={W - PAD} y="60" fontSize="8" fill="var(--muted)" textAnchor="end">{last.label} · {Math.round(last.pct)}%</text>
    </svg>
  )
}

const CHEV = (
  <svg className="hm-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
)

/* ------------------------------------------------------------------- main */

export default function HomeTab({ onOpenTab, onOpenList }) {
  const { games, loading: libLoading } = useLibraryGames()
  const statusMap = useStatusMap()
  const [events, setEvents] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [leavingIds, setLeavingIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  // Bumped by a skip, so the shortlist recomputes. The skip list lives in
  // localStorage, which React cannot subscribe to on its own.
  const [skipTick, setSkipTick] = useState(0)
  const cards = useHomeCards()

  useEffect(() => {
    let cancelled = false
    async function load() {
      const soon = Math.floor((Date.now() + 60 * 86400000) / 1000)
      const [act, wish, gp] = await Promise.all([
        fetchRecentActivity({ days: ACTIVITY_DAYS }),
        // Day-precision only: a quarter or a year resolves to the END of its
        // window, so "Q4 2027" would arrive as 31 Dec and read as a date it is not.
        supabase
          .from('wishlist')
          .select('igdb_id, title, cover, released, release_label')
          .eq('date_precision', 'day')
          .not('released', 'is', null)
          .lte('released', soon)
          .order('released', { ascending: true }),
        supabase.from('gamepass').select('igdb_id').eq('leaving_soon', true),
      ])
      if (cancelled) return
      setEvents(act.data || [])
      setUpcoming(wish.data || [])
      setLeavingIds((gp.data || []).map((r) => r.igdb_id).filter((v) => v != null))
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const bump = () => setSkipTick((t) => t + 1)
    window.addEventListener('gd-home-skip', bump)
    return () => window.removeEventListener('gd-home-skip', bump)
  }, [])

  const week = useMemo(() => weekStats(events, new Date(), WEEK_SPAN), [events])
  const gamesById = useMemo(() => new Map(games.map((g) => [g.master_id, g])), [games])

  const nowPlaying = useMemo(() => {
    // The most RECENTLY played game in the window, not the one with the most
    // minutes: this card answers "what am I in the middle of", and a long session
    // last Tuesday does not beat an hour last night.
    const played = events.filter((e) => num(e.minutes_delta) > 0)
    if (!played.length) return null
    const latest = played.reduce((best, e) => {
      const d = daysBetween(eventDay(e), eventDay(best))
      if (d > 0) return e
      if (d === 0 && num(e.minutes_delta) > num(best.minutes_delta)) return e
      return best
    }, played[0])

    const rows = events
      .filter((e) => e.master_id === latest.master_id && e.percent_after != null)
      .sort((a, b) => eventDay(a) - eventDay(b))
    if (!rows.length) return null

    const game = gamesById.get(latest.master_id) || null
    const first = rows[0]
    const last = rows[rows.length - 1]

    // Carry the last known reading across days with no row, so the line is flat
    // where nothing happened rather than sloping between two points a week apart.
    const points = []
    let cursor = 0
    const from = eventDay(first)
    const spanDays = daysBetween(eventDay(last), from)
    let held = num(first.percent_after)
    for (let i = 0; i <= spanDays; i++) {
      const day = new Date(startOfDay(from).getTime() + i * 86400000)
      const key = dayKey(day)
      while (cursor < rows.length && dayKey(eventDay(rows[cursor])) === key) {
        held = num(rows[cursor].percent_after)
        cursor += 1
      }
      points.push({ pct: held, label: day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) })
    }

    const mine = events.filter((e) => e.master_id === latest.master_id)

    // Completion as of the last reading BEFORE the week, so the gain shown beside
    // "this week" really is this week's.
    const weekStart = new Date(startOfDay(new Date()).getTime() - (WEEK_SPAN - 1) * 86400000)
    const beforeWeek = rows.filter((r) => eventDay(r) < weekStart)
    const weekBasePct = beforeWeek.length ? num(beforeWeek[beforeWeek.length - 1].percent_after) : num(first.percent_after)

    return {
      master_id: latest.master_id,
      title: latest.title,
      environment: latest.environment,
      cover: (game && game.cover_small) || latest.cover_small || null,
      genre: game ? shortGenre(game.genre) : null,
      game,
      lastDay: eventDay(latest),
      percent: num(last.percent_after),
      percentWeekGain: num(last.percent_after) - weekBasePct,
      earned: num(last.earned_awards_after),
      total: num(last.total_awards) || (game ? num(game.total_awards) : 0),
      minutesTotal: game ? num(game.playtime_minutes) : 0,
      achWindow: mine.reduce((s, e) => s + num(e.achievements_delta), 0),
      achWeek: (week.byGame.find((g) => g.master_id === latest.master_id) || {}).achievements || 0,
      windowDays: spanDays + 1,
      points,
    }
  }, [events, gamesById, week])

  const pace = useMemo(() => {
    if (!nowPlaying) return null
    const { earned, total, achWindow, windowDays } = nowPlaying
    const left = total - earned
    if (!total || left <= 0 || achWindow <= 0 || windowDays <= 0) return null
    const perDay = achWindow / windowDays
    return { left, total, earned, perDay, days: Math.ceil(left / perDay), achWindow, windowDays }
  }, [nowPlaying])

  const comingUp = useMemo(() => {
    const today = startOfDay(new Date())
    return upcoming
      .map((w) => {
        // `released` is a calendar day stored as a unix second, so it sits at UTC
        // midnight. Building the local date from its UTC parts keeps a game dated
        // the 20th from reading as the 19th anywhere west of UTC.
        const utc = new Date(num(w.released) * 1000)
        const day = new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())
        return { ...w, day, days: daysBetween(day, today) }
      })
      .filter((w) => w.days >= 0)
      .slice(0, 4)
  }, [upcoming])

  const leaving = useMemo(() => {
    if (!leavingIds.length) return []
    const set = new Set(leavingIds)
    return games
      .filter((g) => g.igdb_id != null && set.has(g.igdb_id) && num(g.playtime_minutes) > 0)
      .sort((a, b) => num(b.playtime_minutes) - num(a.playtime_minutes))
  }, [games, leavingIds])

  const backlog = useMemo(() => backlogGames(games, statusMap), [games, statusMap])
  const neverOpened = useMemo(
    () => backlog.filter((g) => num(g.playtime_minutes) === 0 && !g.last_played).length,
    [backlog]
  )
  const picks = useMemo(
    () => pickUpNext(games, statusMap, 3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [games, statusMap, skipTick]
  )

  if (loading || libLoading) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Home</h1>
          <p className="page-subtitle">{todayLabel()}</p>
        </div>
        <Skeleton count={3} />
      </div>
    )
  }

  const openGame = (g) => g && setSelected(g)

  /* ---- card renderers, keyed to the catalog ---- */

  const CARDS = {
    now_playing: () =>
      nowPlaying ? (
        <div className="chart-card" key="now_playing">
          <h2 className="chart-title">Now playing</h2>
          <button
            type="button"
            className={`np${nowPlaying.game ? '' : ' flat'}`}
            onClick={nowPlaying.game ? () => openGame(nowPlaying.game) : undefined}
          >
            <Cover src={nowPlaying.cover} title={nowPlaying.title} size="sm" />
            <span className="np-b">
              <span className="np-t">{nowPlaying.title}</span>
              <span className="np-s">
                {platformMeta(nowPlaying.environment).label}
                {nowPlaying.genre ? ` · ${nowPlaying.genre}` : ''}
                {` · ${relativeDayLabel(nowPlaying.lastDay)}`}
              </span>
              {nowPlaying.total > 0 ? (
                <>
                  <span className="np-track">
                    <span className="np-fill" style={{ width: `${Math.round((nowPlaying.earned / nowPlaying.total) * 100)}%` }} />
                  </span>
                  <span className="np-s">{nowPlaying.earned} of {nowPlaying.total} achievements</span>
                </>
              ) : null}
            </span>
          </button>
          <div className="np-kv">
            <div>
              <span className="k">This week</span>
              <span className="v">{nowPlaying.achWeek > 0 ? `+${nowPlaying.achWeek}` : '0'} <small>ach</small></span>
            </div>
            <div>
              <span className="k">Completion</span>
              <span className="v">
                {Math.round(nowPlaying.percent)}%
                {nowPlaying.percentWeekGain > 0 ? <small>+{Math.round(nowPlaying.percentWeekGain)}</small> : null}
              </span>
            </div>
            <div>
              <span className="k">On the clock</span>
              <span className="v">{minutesToHhm(nowPlaying.minutesTotal)}</span>
            </div>
          </div>
          {nowPlaying.points.length > 1 ? <Arc points={nowPlaying.points} /> : null}
        </div>
      ) : null,

    week: () => (
      <button type="button" className="hm-tile" key="week" onClick={() => onOpenTab && onOpenTab('insights')}>
        <span className="hm-th"><span className="hm-tk">This week</span>{CHEV}</span>
        <span className="hm-tv">{minutesToHhm(week.minutes)}</span>
        <span className="hm-ts">
          {week.activeDays} of {week.span} days
          {week.achievements > 0 ? ` · +${week.achievements} ach` : ''}
        </span>
      </button>
    ),

    backlog: () => (
      <button type="button" className="hm-tile" key="backlog" onClick={() => onOpenList && onOpenList('status:backlog')}>
        <span className="hm-th"><span className="hm-tk">Backlog</span>{CHEV}</span>
        <span className="hm-tv">{backlog.length}</span>
        <span className="hm-ts">{neverOpened} never opened</span>
      </button>
    ),

    // No leave DATE anywhere: the Game Pass catalog carries `leaving_soon` and
    // nothing else, so this says "soon" rather than inventing a countdown.
    leaving_gp: () =>
      leaving.length ? (
        leaving.length === 1 ? (
          <button type="button" className="hm-banner" key="leaving_gp" onClick={() => openGame(leaving[0])}>
            <Cover src={leaving[0].cover_small} title={leaving[0].title} size="sm" className="hm-bcov" />
            <span className="hm-bb">
              <span className="hm-bk">Leaving Game Pass soon</span>
              <span className="hm-bt">{leaving[0].title}</span>
              <span className="hm-bs">
                {minutesToHhm(num(leaving[0].playtime_minutes))} in, {Math.round(num(leaving[0].percent))}% done
              </span>
            </span>
            {CHEV}
          </button>
        ) : (
          <div className="chart-card" key="leaving_gp">
            <h2 className="chart-title">Leaving Game Pass</h2>
            <div className="ins-sub">Games you have started that are on the way out</div>
            {leaving.map((g) => (
              <button type="button" className="up-row as-btn" key={g.master_id} onClick={() => openGame(g)}>
                <span className="gp-badge">GP</span>
                <span className="up-t">
                  {g.title}
                  <span className="up-d">
                    <span className="leaving">Leaving soon</span>
                    {` · ${minutesToHhm(num(g.playtime_minutes))} in, ${Math.round(num(g.percent))}% done`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )
      ) : null,

    pick_up_next: () =>
      picks.picks.length ? (
        <div className="chart-card" key="pick_up_next">
          <div className="hm-head">
            <h2 className="chart-title">Pick up next</h2>
            <button type="button" className="hm-link" onClick={() => onOpenList && onOpenList('status:backlog')}>
              Backlog · {backlog.length}
            </button>
          </div>
          <div className="ins-sub">{TIER_SUB[picks.tier]}</div>
          {picks.picks.map((g) => (
            <div className="hm-pick" key={g.master_id}>
              <button type="button" className="hm-pb" onClick={() => openGame(g)}>
                <Cover src={g.cover_small} title={g.title} size="sm" className="hm-pcov" />
                <span className="hm-pt">
                  <span className="hm-pn">{g.title}</span>
                  <span className="hm-pm">
                    <i className="hm-chip">{pickReason(g)}</i>
                    {pickMeta(g)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="hm-skip"
                aria-label={`Not now: ${g.title}`}
                title="Not now"
                onClick={() => skipGame(g.master_id)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : null,

    coming_up: () =>
      comingUp.length ? (
        <div className="chart-card" key="coming_up">
          <h2 className="chart-title">Coming up</h2>
          <div className="ins-sub">Wishlisted games with a confirmed date</div>
          {comingUp.map((w) => (
            <div className={`up-row${w.days <= 7 ? ' soon' : ''}`} key={w.igdb_id}>
              <span className="up-when">
                <span className="up-n">{w.days === 0 ? 'Out' : w.days}</span>
                <span className="up-u">{w.days === 0 ? 'today' : w.days === 1 ? 'day' : 'days'}</span>
              </span>
              <span className="up-t">
                {w.title}
                <span className="up-d">{w.day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              </span>
            </div>
          ))}
        </div>
      ) : null,

    pace: () =>
      pace ? (
        <div className="chart-card" key="pace">
          <h2 className="chart-title">Pace</h2>
          <div className="ins-sub">
            {pace.achWindow} {pace.achWindow === 1 ? 'achievement' : 'achievements'} in the last {pace.windowDays} days
          </div>
          <div className="pace-hero">
            <span className="pace-big">~{pace.days} {pace.days === 1 ? 'day' : 'days'}</span>
            <span className="pace-sub">to all {pace.total}, at this rate</span>
          </div>
          <div className="ins-take">A straight line through a list that is never straight, so read it as a floor rather than a date.</div>
        </div>
      ) : null,
  }

  // Consecutive tiles pair up into a row; everything else takes the full width.
  // Grouping happens here rather than in the catalog so turning a tile off can
  // never leave a half-empty grid behind.
  const visible = cards.order.filter((k) => cards.enabled[k] && CARDS[k])
  const blocks = []
  let run = []
  const flush = () => {
    if (!run.length) return
    blocks.push(
      <div className="hm-grid" key={`grid-${blocks.length}`}>
        {run}
      </div>
    )
    run = []
  }
  for (const key of visible) {
    const node = CARDS[key]()
    if (!node) continue
    if (CARD_BY_KEY[key] && CARD_BY_KEY[key].form === 'tile') run.push(node)
    else {
      flush()
      blocks.push(node)
    }
  }
  flush()

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Home</h1>
        <p className="page-subtitle">{todayLabel()}</p>
      </div>

      {/* Two different emptinesses, and saying which is which is the difference
          between a settings problem and a data problem. */}
      {blocks.length ? blocks : (
        <div className="chart-card">
          <div className="chart-empty">
            {visible.length
              ? 'Nothing to show yet. These cards fill in once a sync has some play, a wishlist date or a Game Pass exit to report.'
              : 'Every card is switched off. Open Customize cards to bring some back.'}
          </div>
        </div>
      )}

      <button type="button" className="customize-btn" onClick={() => setCustomizeOpen(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
          <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
          <circle cx="7" cy="18" r="2" fill="currentColor" stroke="none" />
        </svg>
        Customize cards
      </button>

      <CustomizeHome open={customizeOpen} onClose={() => setCustomizeOpen(false)} />
      {selected ? <GameDetail game={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  )
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

// "yesterday" reads better than a date on a card about right now, but only for
// the two days where it is unambiguous.
function relativeDayLabel(day) {
  const diff = daysBetween(new Date(), day)
  if (diff <= 0) return 'played today'
  if (diff === 1) return 'played yesterday'
  return `played ${parseDayOrInstant(dayKey(day)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}
