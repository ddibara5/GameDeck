import { useEffect, useMemo, useRef, useState } from 'react'
import DiscoverCard from './DiscoverCard.jsx'
import DiscoverDetail from './DiscoverDetail.jsx'
import DiscoverRailList from './DiscoverRailList.jsx'
import Cover from './Cover.jsx'
import Skeleton from './Skeleton.jsx'
import WishHeart from './WishHeart.jsx'
import { fetchDiscover, fetchDiscoverHome, loadLibraryTitles, loadGamePass, normTitle } from '../lib/discover.js'
import { releaseTiming } from '../lib/format.js'
import { useWishlist } from '../lib/wishlist.js'
import { useRowsConfig, ROW_BY_KEY } from '../lib/discoverRows.js'

const CURRENT_YEAR = new Date().getFullYear()

// Quick-access chips tuned to Dave's genre play history (no developer filters).
// Each chip resolves to either an IGDB keyword/genre preset (server `preset=`)
// or a plain genre slug (server `genre=`); the API supports both natively.
const CHIPS = [
  { key: 'soulslike', label: 'Soulslike', preset: 'soulslike' },
  { key: 'arpg', label: 'RPG', preset: 'arpg' },
  { key: 'adventure', label: 'Adventure', genre: 'adventure' },
  { key: 'simulator', label: 'Simulator', genre: 'simulator' },
]

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

const PLATFORMS = [
  { key: 'all', label: 'All platforms' },
  { key: 'xbox', label: 'Xbox' },
  { key: 'psn', label: 'PlayStation' },
  { key: 'switch', label: 'Switch' },
  { key: 'steam', label: 'PC / Steam' },
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
const DEFAULT_FILTERS = { genre: 'all', platform: 'all', year: 'all', status: 'all', sort: 'popularity' }

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
  const [gamePass, setGamePass] = useState([])
  const [hideOwned, setHideOwned] = useState(false)

  const debounceRef = useRef(null)
  const reqRef = useRef(0)

  const filtersActive =
    filters.genre !== 'all' ||
    filters.platform !== 'all' ||
    filters.year !== 'all' ||
    filters.status !== 'all' ||
    filters.sort !== 'popularity'
  const browseMode = Boolean(query.trim() || preset || filtersActive)

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
  useEffect(() => {
    let alive = true
    loadGamePass().then((list) => alive && setGamePass(list))
    return () => {
      alive = false
    }
  }, [])

  const { items: wishItems, ids: wishIds } = useWishlist()
  const rowsConfig = useRowsConfig()
  const wishGames = useMemo(
    () => wishItems.map((r) => ({ id: r.igdb_id, name: r.title, cover: r.cover, year: r.year })),
    [wishItems]
  )

  // Enabled IGDB rails, in the user's configured order. (Local rows - wishlist,
  // Game Pass - aren't IGDB rails; they load from their own sources.)
  const enabledRailKeys = useMemo(
    () => rowsConfig.order.filter((k) => rowsConfig.enabled[k] && ROW_BY_KEY[k] && ROW_BY_KEY[k].kind === 'rail'),
    [rowsConfig]
  )
  const railKeySig = enabledRailKeys.join(',')

  // Fetch every enabled rail in ONE batched request instead of one call per rail.
  // Re-runs only when the set of enabled rails changes; results merge in, so a
  // toggled-in rail loads without dropping the rails already on screen.
  useEffect(() => {
    if (!enabledRailKeys.length) return undefined
    let alive = true
    fetchDiscoverHome(enabledRailKeys, 20)
      .then((map) => {
        if (alive) setRails((prev) => ({ ...prev, ...map }))
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
  }, [railKeySig])

  // Results fetch whenever the active query/preset/filters change (debounced on text).
  useEffect(() => {
    if (!browseMode) {
      setResults([])
      setPage(0)
      setError(null)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(0, false), query ? 280 : 0)
    return () => debounceRef.current && clearTimeout(debounceRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, preset, filters, browseMode])

  async function runSearch(nextPage, append) {
    const reqId = ++reqRef.current
    setLoading(true)
    setError(null)
    try {
      const params = {
        q: query.trim() || undefined,
        preset: preset || undefined,
        genre: filters.genre,
        platform: filters.platform,
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

  // A chip is either a preset (keyword/company/genre-id bundle) or a plain
  // genre slug. Selecting one clears the other so only a single chip is active.
  const isChipActive = (chip) =>
    chip.genre ? !preset && filters.genre === chip.genre : preset === chip.key

  function toggleChip(chip) {
    setQuery('')
    if (chip.genre) {
      setPreset(null)
      setFilters((f) => ({
        ...DEFAULT_FILTERS,
        genre: !preset && f.genre === chip.genre ? 'all' : chip.genre,
      }))
    } else {
      setFilters(DEFAULT_FILTERS)
      setPreset((cur) => (cur === chip.key ? null : chip.key))
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
          onClick={() => setHideOwned((v) => !v)}
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

      <div className="preset-row">
        {CHIPS.map((chip) => (
          <button
            key={chip.key}
            type="button"
            className={`preset-chip${isChipActive(chip) ? ' active' : ''}`}
            onClick={() => toggleChip(chip)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {browseMode ? (
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
            let items
            if (row.kind === 'wishlist') items = wishGames
            else if (row.kind === 'wishlistSoon') items = wishGames.filter((g) => g.year && g.year >= CURRENT_YEAR)
            else if (row.kind === 'gamepass') items = hideFromLibrary(gamePass)
            else {
              // IGDB rail: undefined = the batched fetch hasn't resolved yet, so
              // show an in-place skeleton instead of hiding the whole home.
              if (rails[key] === undefined) return <ShelfSkeleton key={key} label={row.label} />
              items = hideFromLibrary(rails[key])
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
                  {items.map((g) => {
                    const timing = releaseTiming(g.released)
                    return (
                      <div className="shelf-card-wrap" key={g.id}>
                        <button type="button" className="shelf-card" onClick={() => setSelected(g)}>
                          <div className="shelf-poster">
                            <Cover src={g.cover} title={g.name} size="lg" />
                            {isOwned(g.name) ? <span className="in-library-dot" title="In library" /> : null}
                          </div>
                          <div className="shelf-card-title">{g.name}</div>
                          <div className="shelf-card-meta">
                            {timing ? <span className={`sc-time ${timing.tone}`}>{timing.label}</span> : null}
                            {timing && g.rating ? <span className="sc-sep"> · </span> : null}
                            {g.rating ? <span>★ {g.rating}</span> : null}
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

            <div className="filter-group">
              <span className="filter-label">Platform</span>
              <div className="filter-options">
                {PLATFORMS.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    className={`filter-opt${filters.platform === o.key ? ' active' : ''}`}
                    onClick={() => setFilters((f) => ({ ...f, platform: o.key }))}
                  >
                    {o.label}
                  </button>
                ))}
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
              <button type="button" className="discover-action" onClick={() => setFilters(DEFAULT_FILTERS)}>
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
          row={openRail}
          seedItems={
            openRail.kind === 'wishlist'
              ? wishGames
              : openRail.kind === 'wishlistSoon'
                ? wishGames.filter((g) => g.year && g.year >= CURRENT_YEAR)
                : openRail.kind === 'gamepass'
                  ? hideFromLibrary(gamePass)
                  : undefined
          }
          isOwned={isOwned}
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
