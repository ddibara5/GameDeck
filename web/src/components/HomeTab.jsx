import { useEffect, useMemo, useState } from 'react'
import Cover from './Cover.jsx'
import Skeleton from './Skeleton.jsx'
import GameDetail from './GameDetail.jsx'
import GameSheet from './GameSheet.jsx'
import CustomizeHome from './CustomizeHome.jsx'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { useWishlist } from '../lib/wishlist.js'
import { relOf, releaseCalendarDay, releaseDaysFromToday } from '../lib/wishlistRelease.js'
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
// Now playing, Release watch and the week totals live here, not on Insights, so
// the landing page stays a current snapshot rather than a second analytics page.

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

// Two covers on either side of today keep both directions visible at once. The
// full release timeline owns everything beyond this compact Home preview.
const RELEASE_VISIBLE = 2

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
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [wishOpen, setWishOpen] = useState(null)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const cards = useHomeCards()

  useEffect(() => {
    let cancelled = false
    // Activity reads from disk first and refreshes behind, so Home no longer
    // waits on the network to draw. The callback is authoritative if it wins the
    // race with the resolved disk copy.
    let freshEvents = false
    loadActivityStart((start) => {
      if (!cancelled) setActivityStart(start)
    }).then((start) => {
      if (!cancelled) setActivityStart(start)
    })
    async function load() {
      const act = await loadRecentActivity({ days: ACTIVITY_DAYS }, (rows) => {
        if (cancelled) return
        freshEvents = true
        setEvents(rows)
      })
      if (cancelled) return
      if (!freshEvents) setEvents(act)
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

  const releaseWatch = useMemo(() => {
    // A wishlist game you have since bought is not release news. `games` is
    // already loaded for Now playing, so this costs no additional read.
    const owned = new Set(games.filter((g) => g.igdb_id != null).map((g) => g.igdb_id))
    const dated = wishItems
      .map((w) => {
        const rel = relOf(w)
        if (rel.k !== 'day' || rel.ts == null) return null
        return { ...w, day: releaseCalendarDay(rel), delta: releaseDaysFromToday(rel) }
      })
      .filter(Boolean)

    const comingUp = dated
      .filter((w) => w.delta > 0 && w.delta <= COMING_UP_DAYS)
      .sort((a, b) => a.delta - b.delta || String(a.title).localeCompare(String(b.title)))
      .slice(0, RELEASE_VISIBLE)
      .map((w) => ({ ...w, days: w.delta }))

    // Day zero belongs to Out now. This is a calendar boundary, not an elapsed
    // timestamp boundary, so it flips at the start of the user's local day.
    const recentlyReleased = dated
      .filter((w) => w.delta <= 0 && w.delta >= -RECENT_DAYS && !owned.has(w.igdb_id))
      .sort((a, b) => b.delta - a.delta || String(a.title).localeCompare(String(b.title)))
      .slice(0, RELEASE_VISIBLE)
      .map((w) => ({ ...w, days: Math.abs(w.delta) }))

    return { comingUp, recentlyReleased }
  }, [wishItems, games])
  const { comingUp, recentlyReleased } = releaseWatch

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

  const releaseRow = (w, direction) => {
    const upcoming = direction === 'upcoming'
    const status = upcoming
      ? { main: w.days, unit: w.days === 1 ? 'day' : 'days' }
      : w.days === 0
        ? { main: 'Out', unit: 'today' }
        : { main: w.days, unit: w.days === 1 ? 'day ago' : 'days ago' }
    return (
      <button
        type="button"
        className={`hm-release-item${upcoming ? ' upcoming' : ' out'}${w.days <= 7 ? ' soon' : ''}`}
        key={`${direction}-${w.igdb_id}`}
        onClick={() => setWishOpen(w)}
        {...gameSheetWarmProps(w, 'wishlist')}
      >
        <Cover src={w.cover} title={w.title} size="sm" className="up-cov" />
        <span className="hm-release-copy">
          <span className="hm-release-title">{w.title}</span>
          <span className="hm-release-date">
            {upcoming ? '' : 'Released '}
            {w.day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          <span className="hm-release-status">
            <b>{status.main}</b> {status.unit}
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
              <div className="hm-release-label-row">
                <div className="hm-release-label upcoming">Coming up</div>
                <span>Next {comingUp.length}</span>
              </div>
              <div className={`hm-release-items${comingUp.length === 1 ? ' single' : ''}`}>
                {comingUp.map((w) => releaseRow(w, 'upcoming'))}
              </div>
            </div>
          ) : null}
          {recentlyReleased[0] ? (
            <div className="hm-release-group">
              <div className="hm-release-label-row">
                <div className="hm-release-label out">Out now</div>
                <span>Newest {recentlyReleased.length}</span>
              </div>
              <div className={`hm-release-items${recentlyReleased.length === 1 ? ' single' : ''}`}>
                {recentlyReleased.map((w) => releaseRow(w, 'out'))}
              </div>
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
              ? 'Nothing to show yet. These cards fill in once a sync has some play or a wishlist date to report.'
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
