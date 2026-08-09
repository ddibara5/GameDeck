import { useEffect, useMemo, useRef, useState } from 'react'
import DiscoverCard from './DiscoverCard.jsx'
import DiscoverDetail from './DiscoverDetail.jsx'
import Cover from './Cover.jsx'
import Skeleton from './Skeleton.jsx'
import { fetchDiscover, loadLibraryTitles, normTitle } from '../lib/discover.js'

// Quick-access chips tuned to Dave's genre play history (no developer filters).
// Each chip resolves to either an IGDB keyword/genre preset (server `preset=`)
// or a plain genre slug (server `genre=`); the API supports both natively.
const CHIPS = [
  { key: 'soulslike', label: 'Soulslike', preset: 'soulslike' },
  { key: 'arpg', label: 'Action RPG', preset: 'arpg' },
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
  { key: 'rating', label: 'Highest rated' },
  { key: 'release', label: 'Newest' },
  { key: 'name', label: 'Name A-Z' },
]

const RAILS = [
  { key: 'popular', label: 'Popular right now' },
  { key: 'upcoming', label: 'Most anticipated' },
  { key: 'recent', label: 'Recently released' },
  { key: 'highly_rated', label: 'Critically acclaimed' },
]

const YEARS = ['all', 2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2016, 2014, 2011]
const PAGE_SIZE = 30
const DEFAULT_FILTERS = { genre: 'all', platform: 'all', year: 'all', sort: 'popularity' }

export default function DiscoverBrowse({ onAsk }) {
  const [query, setQuery] = useState('')
  const [preset, setPreset] = useState(null)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [showFilters, setShowFilters] = useState(false)

  const [rails, setRails] = useState({}) // key -> games[]
  const [railsLoading, setRailsLoading] = useState(true)

  const [results, setResults] = useState([])
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(false)

  const [selected, setSelected] = useState(null)
  const [libTitles, setLibTitles] = useState(null)
  const [hideOwned, setHideOwned] = useState(false)

  const debounceRef = useRef(null)
  const reqRef = useRef(0)

  const filtersActive =
    filters.genre !== 'all' || filters.platform !== 'all' || filters.year !== 'all' || filters.sort !== 'popularity'
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

  // Discovery rails (only needed when not actively browsing).
  useEffect(() => {
    let alive = true
    setRailsLoading(true)
    Promise.all(
      RAILS.map((r) => fetchDiscover({ rail: r.key, limit: 20 }).then((games) => [r.key, games]).catch(() => [r.key, []]))
    ).then((pairs) => {
      if (!alive) return
      const map = {}
      pairs.forEach(([k, v]) => (map[k] = v))
      setRails(map)
      setRailsLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

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
                  <DiscoverCard key={g.id} game={g} inLibrary={isOwned(g.name)} onSelect={setSelected} />
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
      ) : railsLoading ? (
        <Skeleton count={4} />
      ) : (
        RAILS.map((r) => {
          const items = hideFromLibrary(rails[r.key])
          return items.length ? (
            <section className="shelf" key={r.key}>
              <div className="shelf-head">
                <span className="shelf-title">{r.label}</span>
              </div>
              <div className="shelf-row">
                {items.map((g) => (
                  <button type="button" className="shelf-card" key={g.id} onClick={() => setSelected(g)}>
                    <div className="shelf-poster">
                      <Cover src={g.cover} title={g.name} size="lg" />
                      {isOwned(g.name) ? <span className="in-library-dot" title="In library" /> : null}
                    </div>
                    <div className="shelf-card-title">{g.name}</div>
                    <div className="shelf-card-meta">
                      {g.year || ''}
                      {g.rating ? `${g.year ? ' · ' : ''}★ ${g.rating}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ) : null
        })
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
    </div>
  )
}
