import { useEffect, useMemo, useState } from 'react'
import Skeleton from './Skeleton.jsx'
import Cover from './Cover.jsx'
import Hhm from './Hhm.jsx'
import GameDetail from './GameDetail.jsx'
import CustomizeCards from './CustomizeCards.jsx'
import { minutesToHhm, libraryCover } from '../lib/format.js'
import {
  getActivityStartCache,
  getRecentActivityCache,
  loadActivityStart,
  loadRecentActivity,
} from '../lib/recentActivity.js'
import { weekStats, compactHm, bars, WEEK_SPAN } from '../lib/playWeek.js'
import { useCardsConfig } from '../lib/insightsCards.js'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { gameSheetWarmProps } from '../lib/gameSheetWarmIntent.js'
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
          const cover = libraryCover(game, g.cover)
          return (
            <button
              type="button"
              className={`wk-game${game ? '' : ' flat'}`}
              key={g.master_id}
              onClick={game ? () => onOpenGame(game) : undefined}
              {...gameSheetWarmProps(game, 'owned')}
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

// Two windows of activity, so the week block can compare against the one before
// it, and so the progress arc has something to draw.
const ACTIVITY_DAYS = WEEK_SPAN * 2

export default function InsightsTab() {
  // Reuse the local-first library payload already held by the rest of the app.
  // Insights' former private SELECT duplicated the largest launch request and
  // waited for it again on every tab return.
  const { games, loading: gamesLoading } = useLibraryGames()
  const cachedEvents = getRecentActivityCache({ days: ACTIVITY_DAYS })
  const [events, setEvents] = useState(() => cachedEvents || [])
  const [activityStart, setActivityStart] = useState(() => getActivityStartCache())
  const [selected, setSelected] = useState(null)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [activityLoading, setActivityLoading] = useState(() => !cachedEvents)
  const cards = useCardsConfig()

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!cachedEvents) setActivityLoading(true)
      const [act, start] = await Promise.all([
        loadRecentActivity({ days: ACTIVITY_DAYS }, (fresh) => {
          if (!cancelled) setEvents(fresh)
        }),
        loadActivityStart((fresh) => {
          if (!cancelled) setActivityStart(fresh)
        }),
      ])
      if (cancelled) return
      setEvents(act || [])
      setActivityStart(start)
      setActivityLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const loading = gamesLoading || activityLoading

  const week = useMemo(() => weekStats(events, new Date(), WEEK_SPAN, activityStart), [events, activityStart])
  const gamesById = useMemo(() => new Map(games.map((g) => [g.master_id, g])), [games])

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
    week_chart: () => <WeekChart week={week} key="week_chart" />,

    week_games: () => <WeekGames week={week} gamesById={gamesById} onOpenGame={setSelected} key="week_games" />,

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
