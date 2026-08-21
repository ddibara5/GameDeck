import { useEffect, useMemo, useRef, useState } from 'react'
import DiscoverCard from './DiscoverCard.jsx'
import DiscoverDetail from './DiscoverDetail.jsx'
import DiscoverRailList from './DiscoverRailList.jsx'
import Cover from './Cover.jsx'
import Skeleton from './Skeleton.jsx'
import WishHeart from './WishHeart.jsx'
import { fetchDiscover, fetchDiscoverHome, fetchGamesByIds, loadLibraryTitles, loadGamePass, normTitle } from '../lib/discover.js'
import { releaseDayDelta, releaseTiming, timingParts, shelfMetaDate, releaseWindowEndTs } from '../lib/format.js'
import TimingOverlay from './TimingOverlay.jsx'
import { useWishlist } from '../lib/wishlist.js'
import { useRowsConfig, ROW_BY_KEY, getFilledRows, setFilledRows } from '../lib/discoverRows.js'
import { VIBES } from '../lib/vibes.js'
import {
  useDiscoverPrefs,
  setDiscoverPrefs,
  platformParam,
  platformLabel,
  PLATFORM_CHOICES,
} from '../lib/discoverPrefs.js'

const CURRENT_YEAR = new Date().getFullYear()

// How long a wishlisted game stays on "Wishlist - out now" after release.
//
// A year, not a month. At 30 days the row showed 2 of 34 released wishlist games,
// because a wishlist is not a release calendar: things sit on it long after they
// come out, waiting to be bought. A year reads the row as "wishlisted, out, still
// not yours" rather than "released this month", which is the useful question.
const OUT_NOW_WINDOW_DAYS = 365

// One definition of "not out yet", shared by the shelf and its see-all page.
// The year fallback only applies while IGDB metadata is still in flight; a row
// with a real timestamp is judged on that alone. The old year test on its own
// was the Duskfade bug: a wishlist row whose `released` never got refreshed fell
// through to `year >= CURRENT_YEAR` and sat in "coming soon" on release day.
const isComingSoon = (g) => {
  const d = releaseDayDelta(g.released)
  if (d === null) return Boolean(g.year && g.year >= CURRENT_YEAR)
  return d > 0
}

// Out, but recently enough that "finally" still applies. No year fallback here
// on purpose: without a timestamp we cannot tell last week from last decade, and
// guessing would fill this row with the back catalog.
const isOutNow = (g) => {
  const d = releaseDayDelta(g.released)
  return d !== null && d <= 0 && d >= -OUT_NOW_WINDOW_DAYS
}

const GENRES = [
  { key: 'all', label: 'All genres' },
  { key: 'role-playing-rpg', label: 'RPG' },
  { key: 'adventure', label: 'Adventure' },
  { key: 'shooter', label: 'Shooter' },
  { key: 'hack-and-slash-beat-em-up', label: 'Hack & slash' },
  { key: 'platform', label: 'Platformer' },
  { key: 'fighting', label: 'Fighting' },
  { key: 'strategy', label: 'Strategy' },
  { key: 'puzzle', label: 'Puzzle' },
  { key: 'indie', label: 'Indie' },
  { key: 'simulator', label: 'Simulator' },
  { key: 'racing', label: 'Racing' },
]

const SORTS = [
  { key: 'popularity', label: 'Most popular' },
  { key: 'anticipated', label: 'Most anticipated' },
  { key: 'rating', label: 'Highest rated' },
  { key: 'release', label: 'Newest' },
  { key: 'name', label: 'Name A-Z' },
]

const AVAILABILITY = [
  { key: 'all', label: 'All' },
  { key: 'released', label: 'Out now' },
  { key: 'upcoming', label: 'Coming soon' },
]

const RAILS = [
  { key: 'popular', label: 'Popular right now' },
  { key: 'upcoming', label: 'Most anticipated' },
  { key: 'recent', label: 'Recently released' },
  { key: 'highly_rated', label: 'Critically acclaimed' },
]

const YEARS = ['all', 2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2016, 2014, 2011]
const PAGE_SIZE = 30
// Stable identity for "every platform", so the memo below does not recompute on
// every render while the session override is on.
const ALL_PLATFORMS = []
// Cards shown per rail on the home. The full list lives behind each rail's
// "see all" page, so a small inline preview keeps the home light (fewer mounted
// Cover components + image requests) without losing anything.
const RAIL_PREVIEW = 12
// `platform` is deliberately absent: it lives in discoverPrefs, because it is a
// standing preference rather than something you set for one look around.
const DEFAULT_FILTERS = { genre: 'all', year: 'all', status: 'all', sort: 'popularity' }

// In-place placeholder for a rail whose batched data hasn't landed yet. Reserves
// the shelf's height (heading + a row of poster-shaped shimmers) so the home
// doesn't jump as rails fill in.
function ShelfSkeleton({ label }) {
  return (
    <section className="shelf">
      <div className="shelf-head shelf-head-sk">
        <span className="shelf-title-wrap">
          <span className="shelf-title">{label}</span>
        </span>
      </div>
      <div className="shelf-row">
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="shelf-card-wrap" key={i}>
            <div className="shelf-poster">
              <div className="skeleton shelf-poster-sk" />
            </div>
            <div className="skeleton shelf-title-sk" />
          </div>
        ))}
      </div>
    </section>
  )
}

export default function DiscoverBrowse({ onAsk, onCustomize }) {
  const [query, setQuery] = useState('')
  const [preset, setPreset] = useState(null)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [showFilters, setShowFilters] = useState(false)

  const [rails, setRails] = useState({}) // key -> games[]; a key is undefined until its batch resolves

  const [results, setResults] = useState([])
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(false)

  const [selected, setSelected] = useState(null)
  const [openRail, setOpenRail] = useState(null)
  const [libTitles, setLibTitles] = useState(null)
  const [gamePass, setGamePass] = useState(null)

  // The standing preferences, and the one-tap escape from them. `wideOpen` is
  // session-only on purpose: "show me everything, just this once" must not
  // quietly become the new default the next time Discover opens.
  const prefs = useDiscoverPrefs()
  const [wideOpen, setWideOpen] = useState(false)
  const activePlatforms = wideOpen ? ALL_PLATFORMS : prefs.platforms
  const hideOwned = wideOpen ? false : prefs.hideOwned
  const standing = !wideOpen && (prefs.hideOwned || prefs.platforms.length > 0)

  const debounceRef = useRef(null)
  const reqRef = useRef(0)
  const lastFilterSig = useRef(null)

  const filtersActive =
    filters.genre !== 'all' ||
    filters.year !== 'all' ||
    filters.status !== 'all' ||
    filters.sort !== 'popularity'
  // Typing a title is a request for ranked matches, so search still collapses the
  // page into one flat list. Filters and the vibe preset are a different intent -
  // "show me the same shelves, but only RPGs" - so they narrow every rail in
  // place and the browsable structure survives. Rails that filter down to nothing
  // hide themselves.
  const searchMode = Boolean(query.trim())
  const narrowed = Boolean(preset || filtersActive)

  // Load the user's library titles once (for the "In library" badge).
  useEffect(() => {
    let alive = true
    loadLibraryTitles().then((set) => alive && setLibTitles(set))
    return () => {
      alive = false
    }
  }, [])

  const isOwned = useMemo(() => {
    if (!libTitles) return () => false
    return (name) => libTitles.has(normTitle(name))
  }, [libTitles])

  // Load the Game Pass catalog once (only used when the row is enabled, but the
  // fetch is cheap + cached, so we load it unconditionally).
  // null, not [], until it resolves: the row map has to be able to tell "still
  // loading" from "loaded and there is nothing on Game Pass".
  useEffect(() => {
    let alive = true
    loadGamePass().then((list) => alive && setGamePass(list || []))
    return () => {
      alive = false
    }
  }, [])

  const { items: wishItems, ids: wishIds, loading: wishLoading } = useWishlist()
  const rowsConfig = useRowsConfig()
  // Read once per mount. It is a hint about the PREVIOUS load, so re-reading it
  // as it changes would defeat the point.
  const [filledRows] = useState(getFilledRows)

  // Wishlist rows are stored locally with just title/cover/year, so their cards
  // had no countdown, no rating and no real release date while every IGDB-backed
  // rail beside them did. Pull the same fields for them, batched and cached.
  const [wishMeta, setWishMeta] = useState({})
  const wishIdSig = wishItems.map((r) => r.igdb_id).join(',')
  useEffect(() => {
    const ids = wishItems.map((r) => r.igdb_id).filter(Boolean)
    if (!ids.length) {
      setWishMeta({})
      return undefined
    }
    let alive = true
    fetchGamesByIds(ids).then((m) => alive && setWishMeta(m))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wishIdSig])

  const wishGames = useMemo(
    () =>
      wishItems.map((r) => {
        const m = wishMeta[r.igdb_id]
        // The stored row wins for title and cover (it is what the user saw when
        // they saved it); everything else comes from IGDB once it lands.
        //
        // `released` reads live metadata FIRST but falls back to the stored column,
        // which is what `GameDeck | Wishlist - Refresh release dates` exists to keep
        // current. Reading only the live value meant a wishlist row had no release
        // date until IGDB answered, and none at all if IGDB never returned it, so
        // the coming-soon and out-now rows silently under-reported. Live first
        // because a date that has moved should move here too.
        return {
          id: r.igdb_id,
          name: r.title,
          cover: r.cover || (m && m.cover) || null,
          year: r.year || (m && m.year) || null,
          rating: (m && m.rating) || null,
          released: (m && m.released != null ? m.released : r.released) ?? null,
          release: (m && m.release) || null,
          // Carried so the rails can tell "14 Sep 2026" from "sometime in 2026".
          precision: (m && m.release && m.release.precision) || r.date_precision || null,
        }
      }),
    [wishItems, wishMeta]
  )

  // Enabled IGDB rails, in the user's configured order. (Local rows - wishlist,
  // Game Pass - aren't IGDB rails; they load from their own sources.)
  const enabledRailKeys = useMemo(
    () => rowsConfig.order.filter((k) => rowsConfig.enabled[k] && ROW_BY_KEY[k] && ROW_BY_KEY[k].kind === 'rail'),
    [rowsConfig]
  )
  // "Wishlist - coming soon": genuinely unreleased entries, by release timestamp
  // now that we have one. Falls back to the year while the metadata is in flight,
  // which is what it used to do exclusively.
  // Soonest first, and a coarse date resolves to the END of its period so
  // "sometime in 2026" never outranks a game with a real date in 2026. Without
  // this the rail was in wishlist-added order, which is why Ocarina of Time sat
  // at the top on a year-precision date while releasing last.
  const wishSoonGames = useMemo(
    () =>
      wishGames
        .filter(isComingSoon)
        .sort(
          (a, b) =>
            (releaseWindowEndTs(a.released, a.precision) ?? Infinity) -
            (releaseWindowEndTs(b.released, b.precision) ?? Infinity)
        ),
    [wishGames]
  )
  // "Wishlist - out now": the other side of the same boundary. Owned games drop
  // out under the hide-owned toggle, since a game already in the library is no
  // longer one you are waiting for.
  // Most recently released first: the thing you have been waiting for that just
  // landed is the point of the row, and it was previously in wishlist-added order.
  const wishOutNowGames = useMemo(
    () => wishGames.filter(isOutNow).sort((a, b) => (Number(b.released) || 0) - (Number(a.released) || 0)),
    [wishGames]
  )

  // Remember which rows actually had something in them, so the next load knows
  // which ones are worth holding a place for while their data is in flight.
  //
  // Only recorded once NOTHING is pending, and only for the unnarrowed home. A
  // half-loaded page would teach it that every slow row is empty, and a filtered
  // or searched page empties rails on purpose, so either would poison the hint
  // and bring the layout jump back on the following load.
  const railsPending = enabledRailKeys.some((k) => rails[k] === undefined)
  const settled = !wishLoading && gamePass !== null && !railsPending && !searchMode && !narrowed
  const filledSig = settled
    ? rowsConfig.order
        .filter((key) => {
          if (!rowsConfig.enabled[key]) return false
          const row = ROW_BY_KEY[key]
          if (!row) return false
          if (row.kind === 'wishlist') return wishGames.length > 0
          if (row.kind === 'wishlistSoon') return wishSoonGames.length > 0
          if (row.kind === 'wishlistOutNow') return wishOutNowGames.length > 0
          if (row.kind === 'gamepass') return gamePass.length > 0
          return Boolean(rails[key] && rails[key].length)
        })
        .join(',')
    : null
  useEffect(() => {
    if (filledSig === null) return
    setFilledRows(filledSig ? filledSig.split(',') : [])
  }, [filledSig])

  const railKeySig = enabledRailKeys.join(',')
  // The active narrowing, as a stable string, so the rails refetch when it moves.
  //
  // `sort` is only included when the user has actually chosen one. Spreading the
  // whole filter object sent the DEFAULT sort ('popularity') on every home
  // request, which silently re-ordered every rail: "Recently released" became
  // popular-games-that-happen-to-be-recent (Palworld, 007 First Light) instead of
  // newest-first, and Coming soon and Most anticipated collapsed into near
  // duplicates of each other. The see-all pages sent no sort, so they showed the
  // rail's real order - which is why a row never matched the page it opened.
  const railFilters = useMemo(() => {
    const { sort, ...rest } = filters
    return {
      preset: preset || undefined,
      ...rest,
      platform: platformParam(activePlatforms),
      sort: sort !== DEFAULT_FILTERS.sort ? sort : undefined,
    }
  }, [preset, filters, activePlatforms])
  const railFilterSig = JSON.stringify(railFilters)

  // Fetch every enabled rail in ONE batched request instead of one call per rail.
  // Re-runs only when the set of enabled rails changes; results merge in, so a
  // toggled-in rail loads without dropping the rails already on screen.
  useEffect(() => {
    if (!enabledRailKeys.length) return undefined
    let alive = true
    const merge = (map) => setRails((prev) => ({ ...prev, ...map }))
    // A changed filter invalidates every rail on screen; clear them so each shows
    // its skeleton instead of briefly showing results from the previous selection.
    setRails((prev) => (lastFilterSig.current === railFilterSig ? prev : {}))
    lastFilterSig.current = railFilterSig
    fetchDiscoverHome(enabledRailKeys, RAIL_PREVIEW, {
      filters: railFilters,
      // Cached rails paint immediately; this swaps in the refreshed set when the
      // background request lands (only fires if we rendered from disk).
      onFresh: (map) => {
        if (alive) merge(map)
      },
    })
      .then((map) => {
        if (alive) merge(map)
      })
      .catch(() => {
        // Total failure: mark the requested rails empty so they stop showing a
        // skeleton (each then renders as "no data" and is hidden).
        if (!alive) return
        setRails((prev) => {
          const next = { ...prev }
          enabledRailKeys.forEach((k) => {
            if (next[k] === undefined) next[k] = []
          })
          return next
        })
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [railKeySig, railFilterSig])

  // Flat result list, for text search only. Filters no longer trigger this - they
  // narrow the rails instead.
  useEffect(() => {
    if (!searchMode) {
      setResults([])
      setPage(0)
      setError(null)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(0, false), query ? 280 : 0)
    return () => debounceRef.current && clearTimeout(debounceRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, preset, filters, searchMode, railFilterSig])

  async function runSearch(nextPage, append) {
    const reqId = ++reqRef.current
    setLoading(true)
    setError(null)
    try {
      const params = {
        q: query.trim() || undefined,
        preset: preset || undefined,
        genre: filters.genre,
        platform: platformParam(activePlatforms),
        year: filters.year,
        status: filters.status,
        sort: filters.sort,
        page: nextPage,
        limit: PAGE_SIZE,
      }
      const games = await fetchDiscover(params)
      if (reqId !== reqRef.current) return // a newer request superseded this one
      setResults((prev) => (append ? [...prev, ...games] : games))
      setPage(nextPage)
      setHasMore(games.length >= PAGE_SIZE)
    } catch (err) {
      if (reqId !== reqRef.current) return
      setError(err.message || 'Something went wrong')
    } finally {
      if (reqId === reqRef.current) setLoading(false)
    }
  }

  function resetAll() {
    setQuery('')
    setPreset(null)
    setFilters(DEFAULT_FILTERS)
  }

  // Availability drives the `status` param. Unreleased games have no rating
  // counts, so default "Coming soon" to anticipation (hypes) sorting; restore
  // popularity when leaving it, unless the user has since picked another sort.
  function setAvailability(status) {
    setFilters((f) => {
      let sort = f.sort
      if (status === 'upcoming' && sort === 'popularity') sort = 'anticipated'
      else if (status !== 'upcoming' && sort === 'anticipated') sort = 'popularity'
      return { ...f, status, sort }
    })
  }

  function handleMoreLikeThis(game) {
    const g = (game.genres && game.genres[0]) || ''
    const slug = g.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    setSelected(null)
    setPreset(null)
    setQuery('')
    setFilters({ ...DEFAULT_FILTERS, genre: slug || 'all', sort: 'rating' })
  }

  const hideFromLibrary = (list) => (hideOwned && list ? list.filter((g) => !isOwned(g.name)) : list || [])
  const visibleResults = hideFromLibrary(results)

  return (
    <div className="discover-browse">
      <div className="discover-searchbar">
        <input
          type="search"
          className="search-input"
          placeholder="Search all games by title"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (e.target.value) setPreset(null)
          }}
          aria-label="Search games"
        />
        <button
          type="button"
          className={`filter-btn${filtersActive ? ' active' : ''}`}
          onClick={() => setShowFilters(true)}
          aria-label="Filters"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
        </button>
        <button
          type="button"
          className={`filter-btn${hideOwned ? ' active' : ''}`}
          onClick={() => {
            setWideOpen(false)
            setDiscoverPrefs({ ...prefs, hideOwned: !hideOwned })
          }}
          aria-pressed={hideOwned}
          aria-label={hideOwned ? 'Show games in your library' : 'Hide games in your library'}
          title={hideOwned ? 'In-library hidden' : 'Hide in-library'}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {hideOwned ? (
              <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" />
                <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
              </>
            ) : (
              <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
        </button>
      </div>

      {standing || wideOpen ? (
        <div className="showing-strip">
          <span className="showing-label">Showing</span>
          {activePlatforms.length ? <span className="showing-chip">{platformLabel(activePlatforms)}</span> : null}
          {hideOwned ? <span className="showing-chip">Not in library</span> : null}
          {wideOpen ? <span className="showing-chip">Everything</span> : null}
          <button
            type="button"
            className="showing-clear"
            onClick={() => setWideOpen((v) => !v)}
            aria-pressed={wideOpen}
          >
            {wideOpen ? 'Use my defaults' : 'Everything'}
          </button>
        </div>
      ) : null}

      {!searchMode && narrowed ? (
        <div className="results-head">
          <span className="results-count">Filtering every row</span>
          <button type="button" className="results-clear" onClick={resetAll}>
            Clear
          </button>
        </div>
      ) : null}

      {searchMode ? (
        <>
          <div className="results-head">
            <span className="results-count">
              {loading && results.length === 0 ? 'Searching…' : `${visibleResults.length}${hasMore ? '+' : ''} games`}
            </span>
            <button type="button" className="results-clear" onClick={resetAll}>
              Clear
            </button>
          </div>

          {error ? (
            <div className="empty-state">
              <div className="empty-state-title">Couldn't load games</div>
              <div>{error}</div>
            </div>
          ) : loading && results.length === 0 ? (
            <Skeleton count={6} />
          ) : visibleResults.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">No games found</div>
              <div>
                {hideOwned && results.length > 0
                  ? 'Every match is already in your library. Turn off "In-library hidden" to see them.'
                  : 'Try a different search, preset, or filter.'}
              </div>
            </div>
          ) : (
            <>
              <div className="game-list">
                {visibleResults.map((g) => (
                  <DiscoverCard key={g.id} game={g} inLibrary={isOwned(g.name)} wishActive={wishIds.has(g.id)} onSelect={setSelected} />
                ))}
              </div>
              {hasMore ? (
                <div className="show-more-row">
                  <button
                    type="button"
                    className="show-more-btn"
                    onClick={() => runSearch(page + 1, true)}
                    disabled={loading}
                  >
                    {loading ? 'Loading…' : 'Show more'}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </>
      ) : (
        <>
          {rowsConfig.order.map((key) => {
            if (!rowsConfig.enabled[key]) return null
            const row = ROW_BY_KEY[key]
            if (!row) return null
            // Pending is not the same as empty, and conflating the two is what
            // made this tab reorder itself on every load. The IGDB rails always
            // drew a skeleton for an unresolved key; the local rows could not,
            // because an unloaded wishlist and an empty wishlist were both [],
            // so they were dropped from the DOM and inserted themselves later.
            // The rows then appeared in ARRIVAL order rather than the user's,
            // measured at 0.24 CLS with the wishlist and Game Pass pulled to the
            // top. Every row now reports pending explicitly.
            let items
            let pending
            if (row.kind === 'wishlist') {
              items = wishGames
              pending = wishLoading
            } else if (row.kind === 'wishlistSoon') {
              items = wishSoonGames
              pending = wishLoading
            } else if (row.kind === 'wishlistOutNow') {
              items = hideFromLibrary(wishOutNowGames)
              pending = wishLoading
            } else if (row.kind === 'gamepass') {
              items = hideFromLibrary(gamePass)
              pending = gamePass === null
            } else {
              items = rails[key] === undefined ? null : hideFromLibrary(rails[key])
              pending = rails[key] === undefined
            }
            // Only hold a place for a row that had content last time. Otherwise a
            // row that is about to resolve empty (Wishlist - out now, most weeks)
            // would flash a skeleton and disappear, which is the same shift again
            // in the other direction. With no memory yet, reserve for everything.
            if (pending) {
              return filledRows && !filledRows.has(key) ? null : <ShelfSkeleton key={key} label={row.label} />
            }
            if (!items || !items.length) return null
            return (
              <section className={`shelf${row.kind === 'wishlist' ? ' wishlist-rail' : ''}`} key={key}>
                <button type="button" className="shelf-head" onClick={() => setOpenRail(row)}>
                  <span className="shelf-title-wrap">
                    <span className="shelf-title">{row.label}</span>
                    <span className="shelf-caret" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </span>
                  </span>
                </button>
                <div className="shelf-row">
                  {items.slice(0, RAIL_PREVIEW).map((g) => {
                    const timing = releaseTiming(g.released)
                    const parts = timingParts(g.released)
                    // Only set when the line would otherwise be blank.
                    const metaDate = shelfMetaDate(g, timing)
                    return (
                      <div className="shelf-card-wrap" key={g.id}>
                        <button type="button" className="shelf-card" onClick={() => setSelected(g)}>
                          <div className="shelf-poster">
                            <Cover src={g.cover} title={g.name} size="lg" />
                            {isOwned(g.name) ? <span className="in-library-dot" title="In library" /> : null}
                            <TimingOverlay parts={parts} />
                          </div>
                          <div className="shelf-card-title">{g.name}</div>
                          <div className="shelf-card-meta">
                            {g.rating ? <span>★ {g.rating}</span> : null}
                            {metaDate ? <span className="sc-date">{metaDate}</span> : null}
                          </div>
                        </button>
                        <WishHeart game={g} active={wishIds.has(g.id)} />
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
          <button type="button" className="customize-btn" onClick={() => onCustomize && onCustomize()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="7" x2="20" y2="7" />
              <circle cx="9" cy="7" r="2.3" fill="var(--surface)" />
              <line x1="4" y1="17" x2="20" y2="17" />
              <circle cx="15" cy="17" r="2.3" fill="var(--surface)" />
            </svg>
            Customize rows
          </button>
        </>
      )}

      {showFilters ? (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowFilters(false)}>
          <div className="modal-sheet filter-sheet" role="dialog" aria-modal="true" aria-label="Filters">
            <div className="modal-handle" />
            <div className="detail-title">Filters</div>

            <div className="filter-group">
              <span className="filter-label">Genre</span>
              <div className="filter-options">
                {GENRES.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    className={`filter-opt${filters.genre === o.key ? ' active' : ''}`}
                    onClick={() => setFilters((f) => ({ ...f, genre: o.key }))}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Same six categories the Library and shuffler offer. They set `preset`,
                which the API resolves to IGDB keyword/theme ids, so the filtering
                happens server side rather than over whatever page is loaded.
                They sit next to Genre because both answer the same question:
                what kind of game. This replaced the standalone chip row that used
                to sit under the Discover header. */}
            <div className="filter-group">
              <span className="filter-label">Vibe</span>
              <div className="filter-options">
                <button
                  type="button"
                  className={`filter-opt${VIBES.every((v) => v.key !== preset) ? ' active' : ''}`}
                  onClick={() => setPreset(null)}
                >
                  Any
                </button>
                {VIBES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    className={`filter-opt${preset === v.key ? ' active' : ''}`}
                    onClick={() => setPreset((cur) => (cur === v.key ? null : v.key))}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Multi-select, and it PERSISTS. Every other group in this sheet is a
                one-off narrowing cleared by Reset; this one is the standing
                preference, which is why Reset below leaves it alone. */}
            <div className="filter-group">
              <span className="filter-label">Platforms</span>
              <span className="filter-note">Remembered between visits</span>
              <div className="filter-options">
                <button
                  type="button"
                  className={`filter-opt${prefs.platforms.length === 0 ? ' active' : ''}`}
                  onClick={() => {
                    setWideOpen(false)
                    setDiscoverPrefs({ ...prefs, platforms: [] })
                  }}
                >
                  All platforms
                </button>
                {PLATFORM_CHOICES.map((o) => {
                  const on = prefs.platforms.includes(o.key)
                  return (
                    <button
                      key={o.key}
                      type="button"
                      aria-pressed={on}
                      className={`filter-opt${on ? ' active' : ''}`}
                      onClick={() => {
                        setWideOpen(false)
                        setDiscoverPrefs({
                          ...prefs,
                          platforms: on ? prefs.platforms.filter((k) => k !== o.key) : [...prefs.platforms, o.key],
                        })
                      }}
                    >
                      {o.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-label">Availability</span>
              <div className="filter-options">
                {AVAILABILITY.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    className={`filter-opt${filters.status === o.key ? ' active' : ''}`}
                    onClick={() => setAvailability(o.key)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-label">Release year</span>
              <div className="filter-options">
                {YEARS.map((y) => (
                  <button
                    key={y}
                    type="button"
                    className={`filter-opt${String(filters.year) === String(y) ? ' active' : ''}`}
                    onClick={() => setFilters((f) => ({ ...f, year: y }))}
                  >
                    {y === 'all' ? 'Any year' : y}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-label">Sort by</span>
              <div className="filter-options">
                {SORTS.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    className={`filter-opt${filters.sort === o.key ? ' active' : ''}`}
                    onClick={() => setFilters((f) => ({ ...f, sort: o.key }))}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-sheet-actions">
              <button
                type="button"
                className="discover-action"
                onClick={() => {
                  setFilters(DEFAULT_FILTERS)
                  setPreset(null)
                }}
              >
                Reset
              </button>
              <button type="button" className="discover-action primary" onClick={() => setShowFilters(false)}>
                Show results
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selected ? (
        <DiscoverDetail
          game={selected}
          inLibrary={isOwned(selected.name)}
          onAsk={(g) => {
            setSelected(null)
            onAsk(g)
          }}
          onMoreLikeThis={handleMoreLikeThis}
          onClose={() => setSelected(null)}
        />
      ) : null}

      {openRail ? (
        <DiscoverRailList
          filters={narrowed ? railFilters : undefined}
          row={openRail}
          seedItems={
            openRail.kind === 'wishlist'
              ? wishGames
              : openRail.kind === 'wishlistSoon'
                ? wishSoonGames
                : openRail.kind === 'wishlistOutNow'
                  ? hideFromLibrary(wishOutNowGames)
                  : openRail.kind === 'gamepass'
                    ? hideFromLibrary(gamePass)
                    : undefined
          }
          isOwned={isOwned}
          hideOwned={hideOwned}
          wishIds={wishIds}
          onClose={() => setOpenRail(null)}
          onAsk={(g) => {
            setOpenRail(null)
            onAsk(g)
          }}
          onMoreLikeThis={(g) => {
            setOpenRail(null)
            handleMoreLikeThis(g)
          }}
        />
      ) : null}
    </div>
  )
}
