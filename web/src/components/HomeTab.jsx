import { useEffect, useMemo, useState } from 'react'
import Cover from './Cover.jsx'
import Skeleton from './Skeleton.jsx'
import GameDetail from './GameDetail.jsx'
import GameSheet from './GameSheet.jsx'
import DiscoverDetail from './DiscoverDetail.jsx'
import CustomizeHome from './CustomizeHome.jsx'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { loadLeavingSoon } from '../lib/discover.js'
import { useWishlist } from '../lib/wishlist.js'
import { normTitle } from '../lib/discover.js'
import { useHomeCards, CARD_BY_KEY } from '../lib/homeCards.js'
import { platformMeta, minutesToHhm, parseDayOrInstant, libraryCover } from '../lib/format.js'
import { getActivityStartCache, loadActivityStart, loadRecentActivity } from '../lib/recentActivity.js'
import { weekStats, WEEK_SPAN, startOfDay, daysBetween, dayKey, eventDay } from '../lib/playWeek.js'
import { gameSheetWarmProps } from '../lib/gameSheetWarmIntent.js'
import './insights.css'
import './home.css'

// The landing screen. It answers three questions and then stops: what am I in
// the middle of, what expires, what should I start. Anything that reads the same
// next Tuesday belongs on Insights, which is why the lifetime cards are not here
// and why this page ends on the customize button rather than scrolling forever.
//
// Now playing, Release watch, Leaving Game Pass and the week totals live here,
// not on Insights, so the landing page stays a current snapshot rather than a
// second analytics page.

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

// Two windows of activity: one for the week block and one before it so an honest
// prior-period comparison can be shown when history covers the full range.
const ACTIVITY_DAYS = WEEK_SPAN * 2

// How far ahead Coming up looks. Beyond this a release is not news yet.
const COMING_UP_DAYS = 60

// And how far back Recently released looks. The same number pointing the other
// way, so the two cards cover one continuous window either side of today rather
// than two windows chosen separately.
const RECENT_DAYS = 60

// The release watch card shows one item on either side of today. The full release
// timeline owns the rest. Leaving Game Pass keeps a four-row relevance pool but
// Home only renders its strongest item as a compact urgency alert.
const RELEASE_MAX = 4

// The floor for a Game Pass title you do NOT own. Ungated, the leaving window
// offers a 58 next to The Witcher 3's 92, and a card pointing at your last week
// on Game Pass cannot also do that. Same reasoning as the shortlist gate that
// came off Home with Pick up next; the number is a judgement, not a measurement.
const GP_MIN_RATING = 70

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
  const [activityStart, setActivityStart] = useState(() => getActivityStartCache())
  const [gamePass, setGamePass] = useState({ rows: [], available: true, updatedAt: null })
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [wishOpen, setWishOpen] = useState(null)
  const [gpOpen, setGpOpen] = useState(null)
  const [gpExpanded, setGpExpanded] = useState(false)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const cards = useHomeCards()

  useEffect(() => {
    let cancelled = false
    // Both of these read from disk first and refresh behind, so this screen no
    // longer waits on the network to draw. It used to await two live queries
    // before clearing `loading`, which on Dave's machine is ~420ms of skeleton.
    //
    // Each resolves with the DISK copy and calls back with the network one, and
    // the callback can win the race: with a fast connection the fresh
    // rows arrive before the await below continues, and assigning the resolved
    // value then would overwrite them with the stale copy. repro/home.mjs
    // caught exactly that - the Game Pass card kept showing the previous
    // window's rows. So the callback is authoritative once it has fired.
    let freshEvents = false
    let freshLeaving = false
    loadActivityStart((start) => {
      if (!cancelled) setActivityStart(start)
    }).then((start) => {
      if (!cancelled) setActivityStart(start)
    })
    async function load() {
      const [act, gp] = await Promise.all([
        loadRecentActivity({ days: ACTIVITY_DAYS }, (rows) => {
          if (cancelled) return
          freshEvents = true
          setEvents(rows)
        }),
        loadLeavingSoon((state) => {
          if (cancelled) return
          freshLeaving = true
          setGamePass(state)
        }),
      ])
      if (cancelled) return
      if (!freshEvents) setEvents(act)
      if (!freshLeaving) setGamePass(gp)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const week = useMemo(() => weekStats(events, new Date(), WEEK_SPAN, activityStart), [events, activityStart])
  const gamesById = useMemo(() => new Map(games.map((g) => [g.master_id, g])), [games])

  const nowPlaying = useMemo(() => {
    // The most RECENTLY played game in the window, not the one with the most
    // minutes: this card answers "what am I in the middle of", and a long session
    // last Tuesday does not beat an hour last night.
    const played = events.filter((e) => num(e.minutes_delta) > 0)
    if (!played.length) return null

    // WITHIN a day, the answer is the later session, not the longer one.
    //
    // Across days this already did the right thing. Inside one day it took
    // whichever game logged more minutes, which is the opposite of the question
    // the card asks: three hours of Persona in the morning beat forty minutes of
    // Mortal Shell at night, and Home announced Persona while you were sitting in
    // front of the other one.
    //
    // play_events carries a DAY and no time, so the tiebreak reads the game's own
    // last_played instant instead - the same field the Library sorts on, already
    // in BASE_COLUMNS, so no query changes. Minutes remain the last resort for a
    // row whose game is missing from the library payload or carries no timestamp,
    // which is the only state this can fall back to.
    const playedAt = (e) => {
      const g = gamesById.get(e.master_id)
      const t = g && g.last_played ? Date.parse(g.last_played) : NaN
      return Number.isFinite(t) ? t : null
    }
    const latest = played.reduce((best, e) => {
      const d = daysBetween(eventDay(e), eventDay(best))
      if (d > 0) return e
      if (d < 0) return best
      const te = playedAt(e)
      const tb = playedAt(best)
      if (te != null && tb != null && te !== tb) return te > tb ? e : best
      return num(e.minutes_delta) > num(best.minutes_delta) ? e : best
    }, played[0])

    const rows = events
      .filter((e) => e.master_id === latest.master_id && e.percent_after != null)
      .sort((a, b) => eventDay(a) - eventDay(b))
    if (!rows.length) return null

    const game = gamesById.get(latest.master_id) || null
    const last = rows[rows.length - 1]

    // Completion as of the last reading BEFORE the week, so the gain shown beside
    // "this week" really is this week's.
    const weekStart = new Date(startOfDay(new Date()).getTime() - (WEEK_SPAN - 1) * 86400000)
    const beforeWeek = rows.filter((r) => eventDay(r) < weekStart)
    // Without a pre-week reading the gain is unknown. Anchor to the first visible
    // reading so the UI reports zero rather than manufacturing a start at 0%.
    const weekBasePct = beforeWeek.length ? num(beforeWeek[beforeWeek.length - 1].percent_after) : num(rows[0].percent_after)
    const weekGame = week.byGame.find((row) => row.master_id === latest.master_id) || null
    const earned = num(last.earned_awards_after)
    const total = num(last.total_awards) || (game ? num(game.total_awards) : 0)
    const percent = total > 0 ? (earned / total) * 100 : num(last.percent_after)

    return {
      master_id: latest.master_id,
      title: latest.title,
      environment: latest.environment,
      cover: libraryCover(game, latest.cover_small || null),
      genre: game ? shortGenre(game.genre) : null,
      game,
      lastDay: eventDay(latest),
      percent,
      percentWeekGain: Math.max(0, num(last.percent_after) - weekBasePct),
      minutesTotal: game ? num(game.playtime_minutes) : 0,
      minutesWeek: weekGame ? weekGame.minutes : 0,
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
    if (!gamePass.rows.length) return []
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
    for (const r of gamePass.rows) {
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
  }, [games, gamePass.rows])

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

  const releaseRow = (w, direction) => {
    const upcoming = direction === 'upcoming'
    return (
      <button
        type="button"
        className={`up-row as-btn${w.days <= 7 ? ' soon' : ''}`}
        key={`${direction}-${w.igdb_id}`}
        onClick={() => setWishOpen(w)}
        {...gameSheetWarmProps(w, 'wishlist')}
      >
        <Cover src={w.cover} title={w.title} size="sm" className="up-cov" />
        <span className="up-t">
          <span className="up-tt">{w.title}</span>
          <span className="up-d">
            {upcoming ? '' : 'Released '}
            {w.day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        </span>
        <span className="up-when">
          <span className="up-n">{w.days === 0 ? 'Out' : w.days}</span>
          <span className="up-u">
            {upcoming ? (w.days === 0 ? 'today' : w.days === 1 ? 'day' : 'days') : w.days === 1 ? 'day ago' : 'days ago'}
          </span>
        </span>
      </button>
    )
  }

  /* ---- card renderers, keyed to the catalog ---- */

  const CARDS = {
    now_playing: () =>
      nowPlaying ? (
        <div className="chart-card" key="now_playing">
          <div className="np-head"><h2 className="chart-title">Now playing</h2><span>{relativeDayLabel(nowPlaying.lastDay)}</span></div>
          <button
            type="button"
            className={`np${nowPlaying.game ? '' : ' flat'}`}
            onClick={nowPlaying.game ? () => openGame(nowPlaying.game) : undefined}
            {...gameSheetWarmProps(nowPlaying.game, 'owned')}
          >
            <Cover src={nowPlaying.cover} title={nowPlaying.title} size="sm" />
            <span className="np-b">
              <span className="np-t">{nowPlaying.title}</span>
              <span className="np-s">
                {platformMeta(nowPlaying.environment).label}
                {nowPlaying.genre ? ` · ${nowPlaying.genre}` : ''}
              </span>
              {nowPlaying.percent > 0 ? (
                <>
                  <span className="np-track">
                    <span className="np-fill" style={{ width: `${Math.min(100, Math.round(nowPlaying.percent))}%` }} />
                  </span>
                  <span className="np-progress-meta">
                    <span>{Math.round(nowPlaying.percent)}% complete</span>
                    {nowPlaying.percentWeekGain > 0 ? <b>+{Math.round(nowPlaying.percentWeekGain)}% this week</b> : null}
                  </span>
                </>
              ) : null}
            </span>
            {CHEV}
          </button>
          <div className="np-summary">
            <span><b>{minutesToHhm(nowPlaying.minutesWeek)}</b> this week</span>
            <i />
            <span><b>{minutesToHhm(nowPlaying.minutesTotal)}</b> total</span>
          </div>
        </div>
      ) : null,

    week: () => (
      <button type="button" className="hm-tile" key="week" onClick={() => onOpenTab && onOpenTab('insights')}>
        <span className="hm-th"><span className="hm-tk">Recent play</span>{CHEV}</span>
        <span className="hm-wrow">
          <span className="hm-wl">
            <span className="hm-tv">{minutesToHhm(week.minutes)}</span>
            <span className="hm-ts">
              {week.activeDays} of {week.span} days
              {week.hasPrev
                ? ` · ${week.minutes - week.prevMinutes >= 0 ? '↑' : '↓'} ${minutesToHhm(Math.abs(week.minutes - week.prevMinutes))}`
                : week.achievements > 0 ? ` · +${week.achievements} ach` : ''}
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

    leaving_gp: () => {
      if (!gamePass.available) {
        return (
          <div className="hm-gp-alert unavailable" data-card="leaving_gp" key="leaving_gp" role="status">
            <span className="gp-status-mark" aria-hidden="true">!</span>
            <span className="hm-gp-copy">
              <span className="hm-gp-title">Game Pass data unavailable</span>
              <span className="hm-gp-sub">Catalog refresh needs attention</span>
            </span>
          </div>
        )
      }
      if (!leaving.length) return null
      const first = leaving[0]
      const firstMeta = first.mine && num(first.playtime_minutes) > 0
        ? `${minutesToHhm(num(first.playtime_minutes))} in`
        : first.mine
          ? 'Never started'
          : first.rating
            ? `${Math.round(num(first.rating))} rated`
            : ''
      return (
        <div className={`hm-gp-shell${gpExpanded ? ' expanded' : ''}`} data-card="leaving_gp" key="leaving_gp">
          <button
            type="button"
            className="hm-gp-alert"
            onClick={() => leaving.length > 1 ? setGpExpanded((open) => !open) : openLeaving(first)}
            aria-expanded={leaving.length > 1 ? gpExpanded : undefined}
            {...(leaving.length === 1 ? gameSheetWarmProps(first, first.mine ? 'owned' : 'discover') : {})}
          >
            <span className="gp-badge">GP</span>
            <span className="hm-gp-copy">
              <span className="hm-gp-title">Leaving Game Pass</span>
              <span className="hm-gp-sub">{first.title}{firstMeta ? ` · ${firstMeta}` : ''}</span>
            </span>
            {leaving.length > 1 ? <span className="hm-gp-count">+{leaving.length - 1}</span> : null}
            <svg className={`hm-chev${gpExpanded ? ' down' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
          {gpExpanded ? (
            <div className="hm-gp-list">
              {leaving.map((g) => (
                <button
                  type="button"
                  className="hm-gp-row"
                  key={`${g.mine ? 'owned' : 'catalog'}-${g.mine ? g.master_id : g.igdb_id}`}
                  onClick={() => openLeaving(g)}
                  {...gameSheetWarmProps(g, g.mine ? 'owned' : 'discover')}
                >
                  <span className={`hm-gp-rank${g.mine ? ' owned' : ''}`} aria-hidden="true">{g.mine ? 'Y' : 'GP'}</span>
                  <span className="hm-gp-copy">
                    <span className="hm-gp-row-title">{g.title}</span>
                    <span className="hm-gp-sub">
                      {g.mine
                        ? num(g.playtime_minutes) > 0
                          ? `${minutesToHhm(num(g.playtime_minutes))} in · ${Math.round(num(g.percent))}% done`
                          : 'In your library · Never started'
                        : [g.year, g.rating ? `${Math.round(num(g.rating))} rated` : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {CHEV}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )
    },

    release_watch: () =>
      comingUp.length || recentlyReleased.length ? (
        <div className="chart-card hm-release-watch" data-card="release_watch" key="release_watch">
          <div className="hm-head">
            <h2 className="chart-title">
              <button
                type="button"
                className="hm-head-btn"
                aria-label="Release watch, open the release timeline"
                onClick={() => onOpenList && onOpenList('releases')}
              >
                <span>
                  <span className="hm-head-title">Release watch</span>
                  <span className="hm-head-sub">From your wishlist</span>
                </span>
                <span className="hm-more" aria-hidden="true">{CHEV}</span>
              </button>
            </h2>
          </div>
          {comingUp[0] ? (
            <div className="hm-release-group">
              <div className="hm-release-label upcoming">Coming up</div>
              {releaseRow(comingUp[0], 'upcoming')}
            </div>
          ) : null}
          {recentlyReleased[0] ? (
            <div className="hm-release-group">
              <div className="hm-release-label out">Out now</div>
              {releaseRow(recentlyReleased[0], 'out')}
            </div>
          ) : null}
        </div>
      ) : null,
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
