import { useEffect, useMemo, useState } from 'react'
import Skeleton from './Skeleton.jsx'
import Cover from './Cover.jsx'
import Hhm from './Hhm.jsx'
import GameDetail from './GameDetail.jsx'
import CustomizeCards from './CustomizeCards.jsx'
import { libraryCover, minutesToHhm } from '../lib/format.js'
import {
  getActivityStartCache,
  getRecentActivityCache,
  loadActivityStart,
  loadRecentActivity,
} from '../lib/recentActivity.js'
import { bars, compactHm, daysBetween, startOfDay } from '../lib/playWeek.js'
import {
  comparisonAvailableOn,
  genreInsights,
  INSIGHT_GENRE_DAYS,
  INSIGHT_MONTH_DAYS,
  INSIGHT_QUERY_DAYS,
  INSIGHT_WEEK_DAYS,
  periodInsights,
} from '../lib/playInsights.js'
import { useCardsConfig } from '../lib/insightsCards.js'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import './insights.css'

const WEEK_TRACK = 46
const MONTH_TRACK = 58

function PeriodToggle({ span, onChange }) {
  return (
    <div className="ins-period" role="group" aria-label="Insight period">
      <button type="button" className={span === INSIGHT_WEEK_DAYS ? 'active' : ''} aria-pressed={span === INSIGHT_WEEK_DAYS} onClick={() => onChange(INSIGHT_WEEK_DAYS)}>
        7 days
      </button>
      <button type="button" className={span === INSIGHT_MONTH_DAYS ? 'active' : ''} aria-pressed={span === INSIGHT_MONTH_DAYS} onClick={() => onChange(INSIGHT_MONTH_DAYS)}>
        30 days
      </button>
    </div>
  )
}

function Comparison({ insight, firstRecorded }) {
  if (insight.comparisonDelta != null) {
    if (insight.comparisonDelta === 0) return <span className="wk-delta flat">Level with prior period</span>
    const direction = insight.comparisonDelta > 0 ? '↑' : '↓'
    const value = insight.span === INSIGHT_MONTH_DAYS && insight.comparisonPercent != null
      ? `${Math.abs(insight.comparisonPercent)}%`
      : minutesToHhm(Math.abs(insight.comparisonDelta))
    return <span className="wk-delta">{direction} {value}</span>
  }

  const available = comparisonAvailableOn(firstRecorded, insight.span)
  if (!available || available <= startOfDay(new Date())) return null
  return (
    <span className="wk-pend">
      comparison from {available.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
    </span>
  )
}

function PeriodChart({ insight }) {
  if (insight.span === INSIGHT_WEEK_DAYS) {
    const chart = bars(insight.days, WEEK_TRACK)
    return (
      <>
        <div className="wk-chart" aria-label="Daily playtime">
          {chart.map((day) => (
            <div className="wk-col" key={day.key}>
              <span className="wk-cap">{day.minutes ? compactHm(day.minutes) : ''}</span>
              <span className="wk-track">
                <span className={`wk-fill${day.isPeak ? ' peak' : ''}${day.minutes ? '' : day.isToday ? ' today-empty' : ' zero'}`} style={day.minutes ? { height: `${day.h}px` } : undefined} />
              </span>
            </div>
          ))}
        </div>
        <div className="wk-names" aria-hidden="true">
          {insight.days.map((day) => <span className={`wk-name${day.isToday ? ' today' : ''}`} key={day.key}>{day.short}</span>)}
        </div>
      </>
    )
  }

  const peak = Math.max(1, ...insight.buckets.map((bucket) => bucket.minutes))
  return (
    <div className="month-chart" aria-label="Playtime across four parts of the last 30 days">
      {insight.buckets.map((bucket) => (
        <div className="month-col" key={bucket.key}>
          <span className="month-cap">{bucket.minutes ? compactHm(bucket.minutes) : ''}</span>
          <span className="month-track">
            <span className="month-fill" style={{ height: bucket.minutes ? `${Math.max(4, Math.round((bucket.minutes / peak) * MONTH_TRACK))}px` : '2px' }} />
          </span>
          <span className="month-name">{bucket.label}</span>
        </div>
      ))}
    </div>
  )
}

function PeriodSummary({ insight, firstRecorded }) {
  const lead = insight.byGame[0]
  const run = insight.run
  return (
    <section className="chart-card">
      <div className="wk-top">
        <h2 className="chart-title">{insight.span === INSIGHT_WEEK_DAYS ? 'Your week' : 'Your month'}</h2>
        <Comparison insight={insight} firstRecorded={firstRecorded} />
      </div>
      <div className="wk-hero"><span className="wk-big"><Hhm mins={insight.minutes} /></span><span className="wk-played">played</span></div>
      <div className="wk-meta">
        <span><b>{insight.games}</b> {insight.games === 1 ? 'game' : 'games'}</span><span className="wk-dot">·</span>
        <span><b>{insight.achievements}</b> {insight.achievements === 1 ? 'achievement' : 'achievements'}</span><span className="wk-dot">·</span>
        <span><b>{insight.activeDays}</b> active {insight.activeDays === 1 ? 'day' : 'days'}</span>
      </div>
      <PeriodChart insight={insight} />
      {lead || run ? (
        <div className="ins-take">
          {lead ? `${lead.title} led your playtime` : ''}
          {lead && run ? ' · ' : ''}
          {run ? `${run.length} ${run.length === 1 ? 'day' : 'days'} in a row` : ''}
        </div>
      ) : null}
    </section>
  )
}

function TimeSplit({ insight, gamesById, onOpenGame }) {
  return (
    <section className="chart-card">
      <div className="ins-card-head"><h2 className="chart-title">Where your time went</h2><span>Share of playtime</span></div>
      {insight.byGame.length ? (
        <div className="wk-games">
          {insight.byGame.map((row) => {
            const game = gamesById.get(String(row.master_id)) || null
            const detail = row.progressGain != null && row.progressGain > 0
              ? `+${Math.round(row.progressGain)}% progress`
              : row.achievements > 0
                ? `${row.achievements} ${row.achievements === 1 ? 'achievement' : 'achievements'}`
                : null
            return (
              <button type="button" className={`wk-game${game ? '' : ' flat'}`} key={row.master_id} onClick={game ? () => onOpenGame(game) : undefined}>
                <Cover src={libraryCover(game, row.cover)} title={row.title} size="sm" />
                <span className="wk-gb">
                  <span className="wk-gn">{row.title}</span>
                  <span className="wk-gs">
                    {row.days} {row.days === 1 ? 'day' : 'days'}
                    {detail ? ` · ${detail}` : ''}
                  </span>
                  <span className="wk-gtrack"><span className="wk-gfill" style={{ width: `${Math.round(row.share * 100)}%` }} /></span>
                </span>
                <span className="wk-gt">{minutesToHhm(row.minutes)}</span>
              </button>
            )
          })}
        </div>
      ) : <div className="chart-empty">No play recorded in this period.</div>}
    </section>
  )
}

function Momentum({ insight, firstRecorded }) {
  const now = new Date()
  const coverage = firstRecorded && daysBetween(now, firstRecorded) < insight.span - 1
    ? `Since ${firstRecorded.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    : `Last ${insight.span} days`
  return (
    <section className="chart-card">
      <div className="ins-card-head"><h2 className="chart-title">Recent momentum</h2><span>{coverage}</span></div>
      <div className="momentum-grid">
        <div><span>Progress gained</span><b>{insight.progressGames.length ? `+${Math.round(insight.progressGain)}%` : '—'}</b><small>{insight.progressGames.length ? `across ${insight.progressGames.length} ${insight.progressGames.length === 1 ? 'game' : 'games'}` : 'building a baseline'}</small></div>
        <div><span>Games completed</span><b>{insight.completedGames.length}</b><small>{insight.completedGames[0]?.title || 'none recorded'}</small></div>
        <div><span>Games played</span><b>{insight.games}</b><small>{insight.activeDays} active {insight.activeDays === 1 ? 'day' : 'days'}</small></div>
        <div><span>Longest run</span><b>{insight.run ? `${insight.run.length}d` : '—'}</b><small>{insight.run && insight.run.length > 1 ? `${insight.run.from.short} to ${insight.run.to.short}` : 'no multi-day run'}</small></div>
      </div>
    </section>
  )
}

const GENRE_COLORS = ['var(--genre-1)', 'var(--genre-2)', 'var(--genre-3)', 'var(--genre-4)', 'var(--genre-5)']

function genreGradient(genres) {
  let cursor = 0
  return `conic-gradient(${genres.map((genre, index) => {
    const start = cursor
    cursor += genre.share * 100
    return `${GENRE_COLORS[index]} ${start}% ${cursor}%`
  }).join(', ')})`
}

function GenresLately({ genres, firstRecorded }) {
  const lead = genres[0]
  const label = genres.map((genre) => `${genre.genre} ${Math.round(genre.share * 100)} percent`).join(', ')
  const coverage = firstRecorded && daysBetween(new Date(), firstRecorded) < INSIGHT_GENRE_DAYS - 1
    ? `Since ${firstRecorded.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    : `Last ${INSIGHT_GENRE_DAYS} days`
  return (
    <section className="chart-card genre-card">
      <div className="ins-card-head"><h2 className="chart-title">Genres lately</h2><span>{coverage}</span></div>
      <p className="genre-sub">Share of playtime by primary genre</p>
      {genres.length ? (
        <>
          <div className="genre-layout">
            <div className="genre-pie" role="img" aria-label={label} style={{ background: genreGradient(genres) }} />
            <ol className="genre-legend">
              {genres.map((genre, index) => (
                <li key={genre.genre}>
                  <span className="genre-dot" style={{ background: GENRE_COLORS[index] }} aria-hidden="true" />
                  <span className="genre-name">{genre.genre}</span>
                  <span className="genre-share">{Math.round(genre.share * 100)}%</span>
                </li>
              ))}
            </ol>
          </div>
          <p className="genre-take">{lead.genre} led {Math.round(lead.share * 100)}% of your recent playtime.</p>
        </>
      ) : <div className="chart-empty">Genre trends will appear after playtime is recorded.</div>}
    </section>
  )
}

export default function InsightsTab() {
  const { games } = useLibraryGames()
  const cachedEvents = getRecentActivityCache({ days: INSIGHT_QUERY_DAYS })
  const [events, setEvents] = useState(() => cachedEvents || [])
  const [activityStart, setActivityStart] = useState(() => getActivityStartCache())
  const [selected, setSelected] = useState(null)
  const [span, setSpan] = useState(INSIGHT_WEEK_DAYS)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [loading, setLoading] = useState(() => !cachedEvents)
  const cards = useCardsConfig()

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [activity, start] = await Promise.all([
        loadRecentActivity({ days: INSIGHT_QUERY_DAYS }, (fresh) => {
          if (!cancelled) setEvents(fresh)
        }),
        loadActivityStart((fresh) => {
          if (!cancelled) setActivityStart(fresh)
        }),
      ])
      if (cancelled) return
      setEvents(activity || [])
      setActivityStart(start)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const gamesById = useMemo(() => new Map(games.map((game) => [String(game.master_id), game])), [games])
  const insight = useMemo(() => periodInsights(events, new Date(), span, activityStart), [events, span, activityStart])
  const month = useMemo(() => periodInsights(events, new Date(), INSIGHT_MONTH_DAYS, activityStart), [events, activityStart])
  const genres = useMemo(() => genreInsights(events, games, new Date()), [events, games])

  if (loading) {
    return <div><Skeleton count={4} /></div>
  }

  const renderers = {
    week_chart: () => <PeriodSummary insight={insight} firstRecorded={activityStart} key="week_chart" />,
    week_games: () => <TimeSplit insight={insight} gamesById={gamesById} onOpenGame={setSelected} key="week_games" />,
    momentum: () => <Momentum insight={month} firstRecorded={activityStart} key="momentum" />,
    genres: () => <GenresLately genres={genres} firstRecorded={activityStart} key="genres" />,
  }
  const rendered = cards.order.filter((key) => cards.enabled[key] && renderers[key]).map((key) => renderers[key]())

  return (
    <div>
      <PeriodToggle span={span} onChange={setSpan} />
      {rendered.length ? rendered : <div className="chart-card"><div className="chart-empty">Every card is switched off. Open Customize cards to bring some back.</div></div>}
      <button type="button" className="customize-btn" onClick={() => setCustomizeOpen(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" /><circle cx="7" cy="18" r="2" fill="currentColor" stroke="none" /></svg>
        Customize cards
      </button>
      <CustomizeCards open={customizeOpen} onClose={() => setCustomizeOpen(false)} />
      {selected ? <GameDetail game={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  )
}
