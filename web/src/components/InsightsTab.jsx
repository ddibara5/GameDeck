import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import Skeleton from './Skeleton.jsx'
import Cover from './Cover.jsx'
import Hhm from './Hhm.jsx'
import GameDetail from './GameDetail.jsx'
import CustomizeCards from './CustomizeCards.jsx'
import { minutesToHhm } from '../lib/format.js'
import { fetchRecentActivity, fetchActivityStart } from '../lib/recentActivity.js'
import { weekStats, compactHm, bars, WEEK_SPAN } from '../lib/playWeek.js'
import { useCardsConfig } from '../lib/insightsCards.js'
import './insights.css'

// Insights is the OVER TIME tab. Now playing, Coming up, Leaving Game Pass and
// the week totals moved to Home on 20 Aug 2026, along with the arc that only Now
// playing drew: those answer "right now", which is what a landing screen is for.
// They were moved, not copied - their keys are gone from insightsCards.js - so
// nothing renders on both screens.

/* ------------------------------------------------------------------ helpers */

const h = (mins) => Math.round((mins || 0) / 60)
const n = (v) => (Number(v) || 0).toLocaleString()
const num = (v) => Number(v) || 0

// Linear-interpolated quantile over an ascending-sorted array.
function quantile(sorted, p) {
  if (!sorted.length) return 0
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

const SHORT_GENRE = {
  'Role-playing (RPG)': 'RPG',
  'Hack and slash/Beat ’em up': 'Hack & slash',
  "Hack and slash/Beat 'em up": 'Hack & slash',
  'Real Time Strategy (RTS)': 'RTS',
  'Point-and-click': 'Point & click',
  'Card & Board Game': 'Card/Board',
}
const shortGenre = (g) => SHORT_GENRE[g] || g

/* ------------------------------------------------------------- chart shells */

function ChartCard({ title, sub, note, children }) {
  return (
    <div className="chart-card">
      <h2 className="chart-title">{title}</h2>
      {sub ? <div className="ins-sub">{sub}</div> : null}
      {children}
      {note ? <div className="ins-take">{note}</div> : null}
    </div>
  )
}

function Bars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <>
      {rows.map((r, i) => (
        <div className="bar-row" key={i}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(r.value / max) * 100}%`, background: r.color || 'var(--accent)' }} />
          </span>
          <span className="bar-value">{r.display}</span>
        </div>
      ))}
    </>
  )
}

/* ------------------------------------------------------------------ boxplot */

function Boxplot({ d }) {
  const W = 340
  const PAD = 16
  const inner = W - 2 * PAD
  const x = (v) => PAD + (Math.max(0, Math.min(100, v)) / 100) * inner
  const ticks = [0, 25, 50, 75, 100]
  return (
    <svg className="ins-chart" viewBox="0 0 340 108" role="img" aria-label="Completion distribution boxplot">
      <line x1={PAD} y1="80" x2={W - PAD} y2="80" stroke="var(--line)" strokeWidth="1" />
      {ticks.map((t) => (
        <text key={t} x={x(t)} y="94" fontSize="8.5" fill="var(--muted)" textAnchor="middle">{t}{t === 100 ? '%' : ''}</text>
      ))}
      <line x1={x(d.min)} y1="44" x2={x(d.min)} y2="58" stroke="var(--muted)" strokeWidth="1.4" />
      <line x1={x(d.min)} y1="51" x2={x(d.p25)} y2="51" stroke="var(--muted)" strokeWidth="1.4" />
      <line x1={x(d.p75)} y1="51" x2={x(d.p90)} y2="51" stroke="var(--muted)" strokeWidth="1.4" />
      <line x1={x(d.p90)} y1="44" x2={x(d.p90)} y2="58" stroke="var(--muted)" strokeWidth="1.4" />
      <rect x={x(d.p25)} y="38" width={Math.max(1, x(d.p75) - x(d.p25))} height="26" rx="3" fill="var(--walnut)" stroke="var(--walnut-light)" strokeWidth="1" />
      <line x1={x(d.med)} y1="36" x2={x(d.med)} y2="66" stroke="var(--accent)" strokeWidth="2.4" />
      <text x={x(d.med)} y="32" fontSize="8.5" fill="var(--accent)" textAnchor="middle" fontWeight="700">med {Math.round(d.med)}%</text>
      <line x1={x(d.p90)} y1="28" x2={x(d.p90)} y2="70" stroke="var(--amber)" strokeWidth="1" strokeDasharray="3 2" />
      <text x={x(d.p90)} y="24" fontSize="8" fill="var(--amber)" textAnchor="middle">P90 {Math.round(d.p90)}%</text>
      {d.max > d.p90 ? (
        <>
          <circle cx={x(d.max)} cy="51" r="2.6" fill="var(--accent)" />
          <text x={x(d.max)} y="42" fontSize="8" fill="var(--muted)" textAnchor="middle">{Math.round(d.max)}%</text>
        </>
      ) : null}
    </svg>
  )
}

/* --------------------------------------------------------------- week block */

const WEEK_TRACK = 46

function WeekChart({ week }) {
  const delta = week.hasPrev ? week.minutes - week.prevMinutes : null
  return (
    <div className="chart-card">
      <div className="wk-top">
        <h2 className="chart-title">Last {week.span} days</h2>
        {/* Three states, not two. A covered window that logged zero is a real
            comparison; an UNCOVERED one is not, and saying so is better than
            either a wrong arrow or silence that looks like a missing feature. */}
        {delta === null ? (
          week.prevCovered ? null : (
            <span className="wk-pend">vs last week from {week.prevStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          )
        ) : delta === 0 ? (
          <span className="wk-delta flat">Level with last week</span>
        ) : (
          <span className="wk-delta">
            {delta > 0 ? '↑' : '↓'} {minutesToHhm(Math.abs(delta))}
          </span>
        )}
      </div>

      <div className="wk-hero">
        <span className="wk-big"><Hhm mins={week.minutes} /></span>
        <span className="wk-played">played</span>
      </div>

      <div className="wk-meta">
        <span><b>{week.games}</b> {week.games === 1 ? 'game' : 'games'}</span>
        <span className="wk-dot">·</span>
        <span><b>{week.achievements}</b> {week.achievements === 1 ? 'achievement' : 'achievements'}</span>
        <span className="wk-dot">·</span>
        <span><b>{week.activeDays}</b> of {week.span} days</span>
      </div>

      <div className="wk-chart">
        {bars(week.days, WEEK_TRACK).map((d) => (
          <div className="wk-col" key={d.key}>
            <span className="wk-cap">{d.minutes ? compactHm(d.minutes) : ''}</span>
            <span className="wk-track">
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
          <span className={`wk-name${d.isToday ? ' today' : ''}`} key={d.key}>{d.short}</span>
        ))}
      </div>

      {week.run ? (
        <div className="ins-take">
          {week.run.length} {week.run.length === 1 ? 'day' : 'days'} in a row
          {week.run.length > 1 ? `, ${week.run.from.short} to ${week.run.to.short}` : ''}
          {week.best ? ` · best day ${week.best.short}, ${minutesToHhm(week.best.minutes)}` : ''}
        </div>
      ) : null}
    </div>
  )
}

function WeekGames({ week, gamesById, onOpenGame }) {
  if (!week.byGame.length) return null
  const topMinutes = Math.max(week.byGame[0]?.minutes || 0, 1)
  return (
    <div className="chart-card">
      <h2 className="chart-title">What you played this week</h2>
      <div className="wk-games">
        {week.byGame.map((g) => {
          const game = gamesById.get(g.master_id) || null
          const cover = game ? game.cover_small || g.cover : g.cover
          return (
            <button
              type="button"
              className={`wk-game${game ? '' : ' flat'}`}
              key={g.master_id}
              onClick={game ? () => onOpenGame(game) : undefined}
            >
              <Cover src={cover} title={g.title} size="sm" />
              <span className="wk-gb">
                <span className="wk-gn">{g.title}</span>
                <span className="wk-gs">
                  {g.days} {g.days === 1 ? 'day' : 'days'}
                  {g.achievements > 0 ? ` · ${g.achievements} ${g.achievements === 1 ? 'achievement' : 'achievements'}` : ''}
                </span>
                <span className="wk-gtrack">
                  <span className="wk-gfill" style={{ width: `${Math.round((g.minutes / topMinutes) * 100)}%` }} />
                </span>
              </span>
              <span className="wk-gt">{minutesToHhm(g.minutes)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- main */

// master_id and cover_small are NOT optional extras. gamesById is keyed on
// master_id, and without it every key was `undefined`: the week's game rows never
// matched a library row and were rendered flat and untappable, silently, since
// the column list was trimmed. total_awards and igdb_id left with the pace and
// Game Pass cards when those moved to Home; release_year left with the vintage
// histogram before them.
const GAME_COLUMNS =
  'master_id, title, environment, genre, percent, playtime_minutes, earned_awards, last_played, cover_small'

// Two windows of activity, so the week block can compare against the one before
// it, and so the progress arc has something to draw.
const ACTIVITY_DAYS = WEEK_SPAN * 2

export default function InsightsTab() {
  const [games, setGames] = useState([])
  const [events, setEvents] = useState([])
  const [activityStart, setActivityStart] = useState(null)
  const [selected, setSelected] = useState(null)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const cards = useCardsConfig()

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [lib, act, start] = await Promise.all([
        supabase.from('games').select(GAME_COLUMNS),
        fetchRecentActivity({ days: ACTIVITY_DAYS }),
        fetchActivityStart(),
      ])
      if (cancelled) return
      setGames(lib.data || [])
      setEvents(act.data || [])
      setActivityStart(start)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const week = useMemo(() => weekStats(events, new Date(), WEEK_SPAN, activityStart), [events, activityStart])
  const gamesById = useMemo(() => new Map(games.map((g) => [g.master_id, g])), [games])

  /* ---- short term ---- */

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
    // where nothing happened rather than sloping between two points that are a
    // week apart. Anything else draws progress on days with none.
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
    // "this week" really is this week's. Falling back to the first reading in the
    // window would silently widen it to the whole fortnight.
    const weekStart = new Date(startOfDay(new Date()).getTime() - (WEEK_SPAN - 1) * 86400000)
    const beforeWeek = rows.filter((r) => eventDay(r) < weekStart)
    const weekBasePct = beforeWeek.length
      ? num(beforeWeek[beforeWeek.length - 1].percent_after)
      : num(first.percent_after)
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
      minutesWindow: mine.reduce((s, e) => s + num(e.minutes_delta), 0),
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

  /* ---- lifetime ---- */

  const stats = useMemo(() => {
    const total = games.length
    const totalMin = games.reduce((a, g) => a + num(g.playtime_minutes), 0)
    const achievements = games.reduce((a, g) => a + num(g.earned_awards), 0)

    // Measured time, not "has a timestamp". 138 games carry a last_played from a
    // legacy achievement record with no minutes behind it, which made Played a
    // 95% step and Backlog a number nobody recognised.
    const withTime = games.filter((g) => num(g.playtime_minutes) > 0).length
    const overTwoHours = games.filter((g) => num(g.playtime_minutes) >= 120).length
    const past50 = games.filter((g) => num(g.percent) >= 50).length
    const finished = games.filter((g) => num(g.percent) >= 100).length
    const backlog = total - withTime

    const pcts = games.map((g) => num(g.percent)).filter((v) => v > 0).sort((a, b) => a - b)
    const box = {
      n: pcts.length,
      min: pcts[0] || 0,
      p25: quantile(pcts, 0.25),
      med: quantile(pcts, 0.5),
      p75: quantile(pcts, 0.75),
      p90: quantile(pcts, 0.9),
      max: pcts[pcts.length - 1] || 0,
    }

    const byPlay = [...games].sort((a, b) => num(b.playtime_minutes) - num(a.playtime_minutes))
    const topPlayed = byPlay.slice(0, 6).map((g) => ({ label: g.title, value: num(g.playtime_minutes), display: `${h(g.playtime_minutes)}h` }))
    const mostPlayed = byPlay[0]
    const deepest = [...games].filter((g) => num(g.playtime_minutes) > 0).sort((a, b) => num(b.percent) - num(a.percent))[0]
    const mostAch = [...games].sort((a, b) => num(b.earned_awards) - num(a.earned_awards))[0]

    // Genre survives only to name the biggest one in Hall of fame. The scatter it
    // used to feed is gone.
    const gg = {}
    for (const g of games) {
      const key = (g.genre && String(g.genre).trim()) || ''
      if (!key || key === '(none)') continue
      gg[key] = (gg[key] || 0) + num(g.playtime_minutes)
    }
    const topGenreEntry = Object.entries(gg).sort((a, b) => b[1] - a[1])[0]
    const topGenre = topGenreEntry ? { label: shortGenre(topGenreEntry[0]), hrs: h(topGenreEntry[1]) } : null

    return { total, totalMin, achievements, withTime, overTwoHours, past50, finished, backlog, box, topPlayed, mostPlayed, deepest, mostAch, topGenre }
  }, [games])

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Insights</h1>
          <p className="page-subtitle">How your play has been going over time.</p>
        </div>
        <Skeleton count={4} />
      </div>
    )
  }

  const s = stats
  const fpct = (v) => Math.round((v / Math.max(1, s.total)) * 100)

  /* ---- card renderers, keyed to the catalog ---- */

  const CARDS = {
    week_totals: () => (
      <div className="stats-strip" key="week_totals">
        <div className="stat-cell"><div className="stat-value">{h(week.minutes)}h</div><div className="stat-label">7d hours</div></div>
        <div className="stat-cell"><div className="stat-value">{n(week.achievements)}</div><div className="stat-label">7d ach</div></div>
        <div className="stat-cell"><div className="stat-value">{week.activeDays}/{week.span}</div><div className="stat-label">Days</div></div>
        <div className="stat-cell"><div className="stat-value">{n(week.games)}</div><div className="stat-label">Games</div></div>
      </div>
    ),

    week_chart: () => <WeekChart week={week} key="week_chart" />,

    week_games: () => <WeekGames week={week} gamesById={gamesById} onOpenGame={setSelected} key="week_games" />,

    now_playing: () =>
      nowPlaying ? (
        <div className="chart-card" key="now_playing">
          <h2 className="chart-title">Now playing</h2>
          <button
            type="button"
            className={`np${nowPlaying.game ? '' : ' flat'}`}
            onClick={nowPlaying.game ? () => setSelected(nowPlaying.game) : undefined}
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

    pace: () =>
      pace ? (
        <ChartCard
          title="Pace"
          sub={`${pace.achWindow} ${pace.achWindow === 1 ? 'achievement' : 'achievements'} in the last ${pace.windowDays} days`}
          note="A straight line through a list that is never straight, so read it as a floor rather than a date."
          key="pace"
        >
          <div className="pace-hero">
            <span className="pace-big">~{pace.days} {pace.days === 1 ? 'day' : 'days'}</span>
            <span className="pace-sub">to all {pace.total}, at this rate</span>
          </div>
          <div className="pips" aria-label={`${pace.earned} of ${pace.total} achievements`}>
            {Array.from({ length: pace.total }, (_, i) => (
              <i className={`pip${i < pace.earned ? ' on' : ''}`} key={i} />
            ))}
          </div>
        </ChartCard>
      ) : null,

    coming_up: () =>
      comingUp.length ? (
        <ChartCard title="Coming up" sub="Wishlisted games with a confirmed date" key="coming_up">
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
        </ChartCard>
      ) : null,

    leaving_gp: () =>
      leaving.length ? (
        <ChartCard title="Leaving Game Pass" sub="Games you have started that are on the way out" key="leaving_gp">
          {leaving.map((g) => (
            <button type="button" className="up-row as-btn" key={g.master_id} onClick={() => setSelected(g)}>
              <span className="gp-badge">GP</span>
              <span className="up-t">
                {g.title}
                <span className="up-d">
                  <span className="leaving">Leaving soon</span>
                  {` · ${h(g.playtime_minutes)}h in, ${Math.round(num(g.percent))}% done`}
                </span>
              </span>
            </button>
          ))}
        </ChartCard>
      ) : null,

    lifetime: () => (
      <div className="stats-strip" key="lifetime">
        <div className="stat-cell"><div className="stat-value">{n(h(s.totalMin))}</div><div className="stat-label">Hours</div></div>
        <div className="stat-cell"><div className="stat-value">{n(s.achievements)}</div><div className="stat-label">Achieve</div></div>
        <div className="stat-cell"><div className="stat-value">{Math.round(s.box.med)}%</div><div className="stat-label">Median</div></div>
        <div className="stat-cell"><div className="stat-value">{n(s.backlog)}</div><div className="stat-label">Backlog</div></div>
      </div>
    ),

    completion: () => (
      <ChartCard
        title="Completion distribution"
        sub={`Achievement % across ${n(s.box.n)} games you've touched`}
        note={s.box.n > 0 ? `Half your games sit under ${Math.round(s.box.med)}% complete, you're a starter, and that's a real style.` : null}
        key="completion"
      >
        {s.box.n > 0 ? <Boxplot d={s.box} /> : <div className="chart-empty">No completion data yet.</div>}
      </ChartCard>
    ),

    funnel: () => (
      <ChartCard
        title="Starter → Finisher"
        sub="Where games drop off across your library"
        note={`${fpct(s.withTime)}% have time on the clock, ${fpct(s.past50)}% are past halfway, ${s.finished === 0 ? 'and none are finished' : `${n(s.finished)} are finished`}.`}
        key="funnel"
      >
        <div className="ins-funnel">
          {[
            { label: 'Owned', value: s.total, hot: false },
            // Measured minutes, not a timestamp. See the note on GAME_COLUMNS.
            { label: 'Any time on it', value: s.withTime, hot: false },
            { label: 'Over 2 hours', value: s.overTwoHours, hot: false },
            { label: 'Past 50%', value: s.past50, hot: true },
            { label: 'Finished', value: s.finished, hot: false, dead: true },
          ].map((f) => (
            <div className="ins-frow" key={f.label}>
              <span className="ins-flabel">{f.label} <b>{n(f.value)}</b></span>
              <span className="ins-ftrack">
                <span
                  className={`ins-ffill${f.hot ? ' hot' : ''}${f.dead ? ' dead' : ''}`}
                  style={{ width: `${Math.max(f.value > 0 ? 1 : 0, fpct(f.value))}%` }}
                />
              </span>
              <span className="ins-fpct">{fpct(f.value)}%</span>
            </div>
          ))}
        </div>
      </ChartCard>
    ),

    most_played: () => (
      <ChartCard title="Most played" key="most_played">
        {s.topPlayed.length ? <Bars rows={s.topPlayed} /> : <div className="chart-empty">No playtime yet.</div>}
      </ChartCard>
    ),

    hall: () => (
      <ChartCard title="Hall of fame" key="hall">
        <div className="ins-records">
          <div className="ins-rec"><div className="l">Most played</div><div className="v">{s.mostPlayed?.title || '-'}</div><div className="m">{h(s.mostPlayed?.playtime_minutes)} h</div></div>
          <div className="ins-rec"><div className="l">Most complete</div><div className="v">{s.deepest?.title || '-'}</div><div className="m">{Math.round(num(s.deepest?.percent))}% · {h(s.deepest?.playtime_minutes)} h</div></div>
          <div className="ins-rec"><div className="l">Most achievements</div><div className="v">{s.mostAch?.title || '-'}</div><div className="m">{n(num(s.mostAch?.earned_awards))} unlocked</div></div>
          <div className="ins-rec"><div className="l">Biggest genre</div><div className="v">{s.topGenre?.label || '-'}</div><div className="m">{n(s.topGenre?.hrs)} h</div></div>
        </div>
      </ChartCard>
    ),
  }

  const visible = cards.order.filter((k) => cards.enabled[k] && CARDS[k])
  const rendered = visible.map((k) => CARDS[k]()).filter(Boolean)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Insights</h1>
        <p className="page-subtitle">How your play has been going over time.</p>
      </div>

      {rendered.length ? rendered : (
        <div className="chart-card">
          <div className="chart-empty">Every card is switched off. Open Customize cards to bring some back.</div>
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

      <CustomizeCards open={customizeOpen} onClose={() => setCustomizeOpen(false)} />
      {selected ? <GameDetail game={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  )
}

