import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import Cover from './Cover.jsx'
import Skeleton from './Skeleton.jsx'
import GameDetail from './GameDetail.jsx'
import GameSheet from './GameSheet.jsx'
import DiscoverDetail from './DiscoverDetail.jsx'
import CustomizeHome from './CustomizeHome.jsx'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { useWishlist } from '../lib/wishlist.js'
import { normTitle } from '../lib/discover.js'
import { useHomeCards, CARD_BY_KEY } from '../lib/homeCards.js'
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

// How far ahead Coming up looks. Beyond this a release is not news yet.
const COMING_UP_DAYS = 60

// And how far back Recently released looks. The same number pointing the other
// way, so the two cards cover one continuous window either side of today rather
// than two windows chosen separately.
const RECENT_DAYS = 60

// Rows shown before the card is expanded, and the ceiling once it is. Two keeps
// both release cards on the same screen as the rest of Home; four is as many as
// either has ever had inside its window, so "show more" never leads to a fifth
// that is quietly dropped.
// Three cards use these now, not two: Coming up, Recently released and Leaving
// Game Pass all preview two and open to four.
const RELEASE_PREVIEW = 2
const RELEASE_MAX = 4

// The floor for a Game Pass title you do NOT own. Ungated, the leaving window
// offers a 58 next to The Witcher 3's 92, and a card pointing at your last week
// on Game Pass cannot also do that. Same reasoning as the shortlist gate that
// came off Home with Pick up next; the number is a judgement, not a measurement.
const GP_MIN_RATING = 70

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
  // The same cached rows the Wishlist page and the drawer count read, rather
  // than a fourth thin copy of the table. They carry everything the wishlist
  // sheet wants, so a Coming up row can open the sheet the Wishlist page opens.
  const { items: wishItems } = useWishlist()
  const [events, setEvents] = useState([])
  const [leavingRows, setLeavingRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [wishOpen, setWishOpen] = useState(null)
  const [gpOpen, setGpOpen] = useState(null)
  // Which release cards are showing all four rather than the first two. Kept in
  // component state and not in localStorage on purpose: it is a look-at-it-now
  // gesture, not a layout preference, and Customize cards is where layout lives.
  const [expanded, setExpanded] = useState({})
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const cards = useHomeCards()

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [act, gp] = await Promise.all([
        fetchRecentActivity({ days: ACTIVITY_DAYS }),
        supabase.from('gamepass').select('igdb_id, name, cover, year, rating').eq('leaving_soon', true),
      ])
      if (cancelled) return
      setEvents(act.data || [])
      setLeavingRows((gp.data || []).filter((r) => r.igdb_id != null))
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
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

  const comingUp = useMemo(() => {
    const today = startOfDay(new Date())
    const soon = Math.floor((Date.now() + COMING_UP_DAYS * 86400000) / 1000)
    return wishItems
      // Day precision only: a quarter or a year resolves to the END of its
      // window, so "Q4 2027" would arrive as 31 Dec and read as a date it is not.
      // This used to be a server-side filter on Home's own query; it is a client
      // filter now that the rows come from the shared cache.
      .filter((w) => w.date_precision === 'day' && w.released != null && num(w.released) <= soon)
      .map((w) => {
        // `released` is a calendar day stored as a unix second, so it sits at UTC
        // midnight. Building the local date from its UTC parts keeps a game dated
        // the 20th from reading as the 19th anywhere west of UTC.
        const utc = new Date(num(w.released) * 1000)
        const day = new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())
        return { ...w, day, days: daysBetween(day, today) }
      })
      .filter((w) => w.days >= 0)
      .sort((a, b) => a.days - b.days)
      .slice(0, RELEASE_MAX)
  }, [wishItems])

  // The same wishlist rows, the other side of today. Day 0 belongs to Coming up,
  // which renders it as "Out today", so this starts at one day ago and the two
  // cards can never show the same game.
  const recentlyReleased = useMemo(() => {
    const today = startOfDay(new Date())
    // A wishlist game you have since bought is not news. `games` is already
    // loaded for every other card on this page, so this costs no read.
    const owned = new Set(games.filter((g) => g.igdb_id != null).map((g) => g.igdb_id))
    return wishItems
      .filter((w) => w.date_precision === 'day' && w.released != null && !owned.has(w.igdb_id))
      .map((w) => {
        const utc = new Date(num(w.released) * 1000)
        const day = new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())
        return { ...w, day, days: daysBetween(today, day) }
      })
      .filter((w) => w.days >= 1 && w.days <= RECENT_DAYS)
      .sort((a, b) => a.days - b.days)
      .slice(0, RELEASE_MAX)
  }, [wishItems, games])

  // Yours first, then the rest of what is going.
  //
  // This card used to be only about games you had started, which was right when
  // the question was "use it or lose it". It reads five titles today and exactly
  // one of them is in the library, so under that rule it is a one-row card most
  // months. "Leaving soon" is a clock, and a clock is worth reading whether or
  // not you already own the thing, so the pool is the whole leaving window with
  // your own games pinned to the top.
  //
  // `mine` is what every consumer below branches on: it decides the subtitle and
  // it decides which sheet the row opens.
  //
  // Ownership is matched by igdb_id FIRST and by normalised title second,
  // because IGDB gives an edition its own id: the Game Pass row for The Witcher
  // 3 is 119402 (Complete Edition) while both library rows carry 1942, so an
  // id-only join calls a game with 20h on it "not yours" and offers to wishlist
  // it. Seven of the 499 catalogue rows are in that position today (Silksong,
  // Mirror's Edge, Resident Evil 2, UNO, Mass Effect, Gears of War and the
  // Witcher), and all seven were checked by hand: seven real matches, zero
  // false ones.
  //
  // byId-then-byTitle, resolving duplicates to the most-played row, is the shape
  // `buildLibraryIndex` in lib/news.js already uses, and `normTitle` is the same
  // one Discover badges "In library" with. One definition of "the same game".
  const leaving = useMemo(() => {
    if (!leavingRows.length) return []
    const byId = new Map()
    const byTitle = new Map()
    // A game owned on two platforms has a row each, and the one worth showing is
    // the one carrying the time: the Witcher on PSN (1249m) not on Xbox (0m).
    const better = (a, b) => num(a && a.playtime_minutes) > num(b && b.playtime_minutes)
    for (const g of games) {
      if (g.igdb_id != null && (!byId.has(g.igdb_id) || better(g, byId.get(g.igdb_id)))) byId.set(g.igdb_id, g)
      const k = normTitle(g.title)
      if (k && (!byTitle.has(k) || better(g, byTitle.get(k)))) byTitle.set(k, g)
    }
    const mine = []
    const theirs = []
    // Two storefront entries can resolve to one IGDB game (a base game and its
    // edition), which the catalog sync already knows and ORs the flag over. Both
    // can therefore be in this window and both can now land on the same library
    // row, so the row is claimed once: without this the card prints the same
    // game twice, under one React key.
    const claimed = new Set()
    for (const r of leavingRows) {
      const g = byId.get(r.igdb_id) || byTitle.get(normTitle(r.name)) || null
      if (g && claimed.has(g.master_id)) continue
      if (g) claimed.add(g.master_id)
      // Owned counts whether or not you have started it. Started is the better
      // row and sorts above, but "it is in your library, you never opened it,
      // and it goes this week" is the single most actionable line this card can
      // print, and the old rule dropped it from BOTH buckets.
      if (g) mine.push({ ...g, mine: true })
      else if (num(r.rating) >= GP_MIN_RATING) theirs.push({ ...r, title: r.name, mine: false })
    }
    mine.sort((a, b) => num(b.playtime_minutes) - num(a.playtime_minutes))
    theirs.sort((a, b) => num(b.rating) - num(a.rating))
    return [...mine, ...theirs].slice(0, RELEASE_MAX)
  }, [games, leavingRows])

  if (loading || libLoading) {
    return (
      <div>
        <div className="page-header">
          <p className="page-subtitle">{todayLabel()}</p>
        </div>
        <Skeleton count={3} />
      </div>
    )
  }

  // Bar heights are relative to the busiest day in the window rather than to a
  // fixed ceiling, so a quiet week still shows its own shape instead of a row of
  // stubs. A day that was played never drops below 8% or it reads as a zero next
  // to a big one.
  //
  // The four states are the Insights chart's, not new ones: fill, peak, a stub
  // for a day with nothing on it, and a dashed rule for TODAY with nothing yet.
  // That last distinction is the one worth carrying down to this size, because
  // "did not play" and "not over yet" are different claims about the same
  // zero-height bar.
  const weekPeak = Math.max(1, ...week.days.map((d) => d.minutes))
  const barClass = (d) => {
    if (d.minutes > 0) return d.minutes === weekPeak ? ' peak' : ''
    return d.isToday ? ' today-empty' : ' zero'
  }
  const barStyle = (d) =>
    d.minutes > 0 ? { height: `${Math.max(8, Math.round((d.minutes / weekPeak) * 100))}%` } : undefined

  const openGame = (g) => g && setSelected(g)

  // Every row on this card opens something now. A game you own opens the owned
  // detail; a catalogue row opens the DISCOVER sheet, which is the surface the
  // app already has for an IGDB game you do not own, and the one News uses for
  // exactly this case.
  //
  // The seed is sparse on purpose. GameSheet's discover variant already handles
  // an entry that carries only id/name/cover/year: it paints a skeleton the
  // right height and fetches the rest by id. Awaiting the fetch first, the way
  // News does, would mean a tap that does nothing for as long as IGDB takes.
  const openLeaving = (g) =>
    g.mine
      ? openGame(g)
      : setGpOpen({ id: g.igdb_id, name: g.title, cover: g.cover, year: g.year, rating: g.rating })

  // Preview two, open to four. Extracted the moment a THIRD card wanted it:
  // Leaving Game Pass cannot reuse releaseCard, because its rows are a badge and
  // a subtitle rather than a day column, but the control underneath them is the
  // same control and should not be a third copy of the same fourteen lines.
  //
  // Renders nothing when there is nothing behind it. A control that expands
  // nothing is worse than no control.
  const moreToggle = (key, total) => {
    const open = expanded[key]
    const rest = total - RELEASE_PREVIEW
    if (rest <= 0) return null
    return (
      <button
        type="button"
        className={`hm-expand${open ? ' open' : ''}`}
        aria-expanded={open}
        onClick={() => setExpanded((e) => ({ ...e, [key]: !open }))}
      >
        {open ? 'Show less' : `Show ${rest} more`}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    )
  }

  // Coming up and Recently released are one card with the clock pointing either
  // way: same rows, same chevron to the wishlist, same expand. Written once,
  // because this codebase has already paid twice for a second copy that drifts.
  const releaseCard = ({ key, title, sub, rows, unit, hot, to, toLabel }) => {
    const shown = expanded[key] ? rows : rows.slice(0, RELEASE_PREVIEW)
    // data-card so the harness can address one release card rather than counting
    // .up-row across both and hoping the sum means something.
    return (
      <div className="chart-card" data-card={key} key={key}>
        <div className="hm-head">
          {/* The whole heading is the target, not the mark at the end of it. A
              34px chevron was a fine thing to look at and a poor thing to hit
              next to 200px of heading that did the same job and did nothing.
              The button is INSIDE the h2 rather than around it: a button may
              contain phrasing content, and an h2 is not phrasing content, so
              the other nesting is invalid and costs the card its heading.

              Each card names its own destination, because the two are not the
              same list read twice. Coming up leads to the wishlist, which opens
              on This month and runs forward. Recently released led there too,
              and that was wrong: its rows land in the Out now SECTION, which
              sorts below every future month, quarter and year, so the card sent
              you to a page whose last row was the thing you tapped for. */}
          <h2 className="chart-title">
            <button
              type="button"
              className="hm-head-btn"
              // The visible text has to be IN the accessible name, or a voice
              // control user saying "tap Coming up" hits nothing. So the label
              // is the heading plus where it goes, not just where it goes.
              aria-label={`${title}, ${toLabel}`}
              onClick={() => onOpenList && onOpenList(to)}
            >
              {title}
              <span className="hm-more" aria-hidden="true">
                {CHEV}
              </span>
            </button>
          </h2>
        </div>
        <div className="ins-sub">{sub}</div>
        {shown.map((w) => (
          <button
            type="button"
            className={`up-row as-btn${hot(w) ? ' soon' : ''}`}
            key={w.igdb_id}
            onClick={() => setWishOpen(w)}
          >
            <span className="up-when">
              <span className="up-n">{w.days === 0 ? 'Out' : w.days}</span>
              <span className="up-u">{unit(w)}</span>
            </span>
            <span className="up-t">
              {w.title}
              <span className="up-d">{w.day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            </span>
          </button>
        ))}
        {moreToggle(key, rows.length)}
      </div>
    )
  }

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
        <span className="hm-wrow">
          <span className="hm-wl">
            <span className="hm-tv">{minutesToHhm(week.minutes)}</span>
            <span className="hm-ts">
              {week.activeDays} of {week.span} days
              {week.achievements > 0 ? ` · +${week.achievements} ach` : ''}
            </span>
          </span>
          {/* aria-hidden: the tile's own text already says the total and the day
              count, and seven unlabelled bars read out one letter at a time is
              noise rather than information. */}
          <span className="hm-bars" aria-hidden="true">
            {week.days.map((d) => (
              <span key={d.key} className={`hm-bar${d.isToday ? ' today' : ''}`}>
                <span className="hm-btrack">
                  <span className={`hm-bfill${barClass(d)}`} style={barStyle(d)} />
                </span>
                <em>{d.label}</em>
              </span>
            ))}
          </span>
        </span>
      </button>
    ),

    // No leave DATE anywhere: the Game Pass catalog carries `leaving_soon` and
    // nothing else, so this says "soon" rather than inventing a countdown.
    // The single-title BANNER is gone. It existed because a heading over one line
    // was more chrome than content, which was true while one line was all this
    // could hold; the pool is four now and the card form is the right one.
    //
    // No row repeats "Leaving soon" any more either. The heading says it once,
    // and the line under each title is better spent on why THIS one is worth the
    // last week: how far in you already are, or how well it reviewed.
    leaving_gp: () =>
      leaving.length ? (
        <div className="chart-card" data-card="leaving_gp" key="leaving_gp">
          <div className="hm-head">
            <h2 className="chart-title">Leaving Game Pass</h2>
          </div>
          <div className="ins-sub">Yours first, then what else is going</div>
          {(expanded.leaving_gp ? leaving : leaving.slice(0, RELEASE_PREVIEW)).map((g) => (
            <button
              type="button"
              className="up-row as-btn"
              key={g.igdb_id}
              onClick={() => openLeaving(g)}
            >
              <span className="gp-badge">GP</span>
              <span className="up-t">
                {g.title}
                <span className="up-d">
                  {g.mine ? (
                    num(g.playtime_minutes) > 0 ? (
                      <>
                        <span className="leaving">{minutesToHhm(num(g.playtime_minutes))} in</span>
                        {` · ${Math.round(num(g.percent))}% done`}
                      </>
                    ) : (
                      <span className="leaving">In your library, never started</span>
                    )
                  ) : (
                    [g.year, g.rating ? `${Math.round(num(g.rating))} rated` : null].filter(Boolean).join(' · ')
                  )}
                </span>
              </span>
            </button>
          ))}
          {moreToggle('leaving_gp', leaving.length)}
        </div>
      ) : null,

    coming_up: () =>
      comingUp.length
        ? releaseCard({
            key: 'coming_up',
            title: 'Coming up',
            sub: 'Wishlisted games with a confirmed date',
            rows: comingUp,
            unit: (w) => (w.days === 0 ? 'today' : w.days === 1 ? 'day' : 'days'),
            hot: (w) => w.days <= 7,
            to: 'wishlist',
            toLabel: 'open your wishlist',
          })
        : null,

    recently_released: () =>
      recentlyReleased.length
        ? releaseCard({
            key: 'recently_released',
            title: 'Recently released',
            sub: 'Out now, and still not in your library',
            rows: recentlyReleased,
            // "ago" rather than "days ago": the column is 52px and the date sits
            // on the line below, so the unit only has to point backwards.
            unit: () => 'ago',
            // The mirror of Coming up's amber: out inside the last week is the
            // thing you might actually do something about tonight.
            hot: (w) => w.days <= 7,
            to: 'released',
            toLabel: 'open the Out now list',
          })
        : null,
  }

  // Consecutive tiles pair up into a row; everything else takes the full width.
  // Grouping happens here rather than in the catalog so turning a tile off can
  // never leave a half-empty grid behind.
  //
  // A run of ONE is not a pair, and `solo` gives it the whole width rather than
  // leaving it sitting in the left half of a two-column grid with nothing beside
  // it. It keeps the tile's height, so it reads as a bar rather than a card. This
  // is the rule that mattered the moment Backlog was removed and This week became
  // the only tile, and it is a rule rather than a special case: put a second tile
  // back in the catalog and the two pair up again with nothing else to change.
  const visible = cards.order.filter((k) => cards.enabled[k] && CARDS[k])
  const blocks = []
  let run = []
  const flush = () => {
    if (!run.length) return
    blocks.push(
      <div className={`hm-grid${run.length === 1 ? ' solo' : ''}`} key={`grid-${blocks.length}`}>
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
      {/* A Coming up row is a WISHLIST row, not an owned game, so it opens the
          wishlist variant of the sheet - the same one the Wishlist page opens,
          with the same heart and the same remove. */}
      {wishOpen ? <GameSheet variant="wishlist" game={wishOpen} onClose={() => setWishOpen(null)} /> : null}
      {/* A Game Pass row you do not own is an IGDB game, so it opens the sheet
          Discover and News open, with the same wishlist heart. No Ask AI and no
          More like this: both are Discover callbacks that navigate WITHIN
          Discover, and Home has no route there, so the props are left off and
          GameSheet hides the buttons. */}
      {gpOpen ? <DiscoverDetail game={gpOpen} onClose={() => setGpOpen(null)} /> : null}
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
