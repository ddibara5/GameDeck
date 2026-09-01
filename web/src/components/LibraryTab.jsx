import { useEffect, useMemo, useState } from 'react'
import GameCard from './GameCard.jsx'
import GameDetail from './GameDetail.jsx'
import Skeleton from './Skeleton.jsx'
import { MessageState } from './AsyncState.jsx'
import { useStatusMap, effectiveStatus } from '../lib/userStatus.js'
import { platformMeta } from '../lib/format.js'
import { useLibraryGames, useVibeKeywords } from '../lib/useLibraryGames.js'
import { VIBES, hasVibe, availableVibes } from '../lib/vibes.js'
import { topGenres } from '../lib/gameGenres.js'
import { useDialogA11y } from '../lib/useDialogA11y.js'

// Derived from platformMeta so this cannot drift from the labels on the cards it
// filters. It used to say "PSN" and "Steam" while the cards beside it said
// "PlayStation" and Discover said "PC / Steam".
const PLATFORM_FILTERS = [
  { key: 'all', label: 'All' },
  ...['xbox', 'psn', 'steam'].map((key) => ({ key, label: platformMeta(key).label })),
]

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'playing', label: 'Playing' },
  { key: 'backlog', label: 'Backlog' },
  { key: 'finished', label: 'Finished' },
]

const SORT_OPTIONS = [
  { key: 'last_played', label: 'Last played' },
  { key: 'title', label: 'Title A-Z' },
  { key: 'percent', label: 'Completion %' },
  { key: 'playtime', label: 'Playtime' },
  { key: 'achievements', label: 'Achievements' },
]

// The library query used to live here as a second, private column list. It had
// already drifted from the shared one, missing `keywords` and `igdb_rating`, which
// would have made every vibe chip below return nothing while looking perfectly
// healthy. Same shape of bug as the missing `igdb_id` that silently killed the
// shuffler's Game Pass weighting. One list, one fetch, in useLibraryGames.

// Subtitle under the large title. Deliberately two facts rather than a stat
// block: how big the library is, and how big the pile you have not started is.
// An empty or still-loading library gets no line at all rather than "0 games",
// which reads like the fetch failed.
function librarySummary(games) {
  if (!games || !games.length) return ''
  const unplayed = games.filter((g) => !g.playtime_minutes).length
  const total = `${games.length.toLocaleString()} games`
  return unplayed ? `${total} · ${unplayed} unplayed` : total
}

export default function LibraryTab() {
  const { games, loading, error } = useLibraryGames()
  const [platformFilter, setPlatformFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortKey, setSortKey] = useState('last_played')
  const [vibe, setVibe] = useState('any')
  const [genre, setGenre] = useState('any')
  const [showFilters, setShowFilters] = useState(false)
  const filterDialogRef = useDialogA11y({ active: showFilters, onClose: () => setShowFilters(false) })
  const [selectedGame, setSelectedGame] = useState(null)
  const [visibleCount, setVisibleCount] = useState(12)
  const statusMap = useStatusMap()

  // Only offer chips that can return something, so tapping one never lands on an
  // empty library. Recomputed from the loaded set rather than hardcoded.
  // keywords arrive separately from the library rows; see useVibeKeywords. They
  // are only fetched once the filter sheet has been opened, because that is the
  // only place in this tab that reads them, and the Library is the landing tab.
  const kwMap = useVibeKeywords(showFilters)
  const vibes = useMemo(() => availableVibes(games, 5, kwMap), [games, kwMap])
  const genres = useMemo(() => topGenres(games, 10), [games])

  // Count of narrowing filters, shown on the button. The controls used to be
  // visible in the header, so what was applied was self-evident; behind a sheet it
  // is not, and a filtered library that looks unfiltered is how you conclude games
  // are missing. Sort is excluded: it reorders, it does not hide anything.
  const activeCount =
    (platformFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (genre !== 'any' ? 1 : 0) +
    (vibe !== 'any' ? 1 : 0)

  function resetFilters() {
    setPlatformFilter('all')
    setStatusFilter('all')
    setGenre('any')
    setVibe('any')
    setSortKey('last_played')
  }

  const visibleGames = useMemo(() => {
    let list = games

    if (platformFilter !== 'all') {
      list = list.filter((g) => String(g.environment).toLowerCase() === platformFilter)
    }

    if (statusFilter !== 'all') {
      list = list.filter((g) => effectiveStatus(g, statusMap) === statusFilter)
    }

    if (genre !== 'any') {
      list = list.filter((g) => g.genre === genre)
    }

    if (vibe !== 'any') {
      list = list.filter((g) => hasVibe(g, vibe, kwMap))
    }

    const sorted = [...list]
    switch (sortKey) {
      case 'title':
        sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
        break
      case 'percent':
        sorted.sort((a, b) => (Number(b.percent) || 0) - (Number(a.percent) || 0))
        break
      case 'playtime':
        sorted.sort((a, b) => (b.playtime_minutes || 0) - (a.playtime_minutes || 0))
        break
      case 'achievements':
        sorted.sort((a, b) => (b.earned_awards || 0) - (a.earned_awards || 0))
        break
      case 'last_played':
      default:
        sorted.sort((a, b) => {
          if (!a.last_played && !b.last_played) return 0
          if (!a.last_played) return 1
          if (!b.last_played) return -1
          return new Date(b.last_played) - new Date(a.last_played)
        })
        break
    }
    return sorted
    // kwMap is a dependency: the vibe filter reads it, and it arrives after the
    // first render. Without it here, picking a vibe before the keywords land
    // would filter against an empty map and never recompute.
  }, [games, platformFilter, statusFilter, genre, vibe, sortKey, statusMap, kwMap])

  // Reset the visible window whenever the filter/search/sort changes.
  useEffect(() => {
    setVisibleCount(12)
  }, [platformFilter, statusFilter, genre, vibe, sortKey])

  return (
    <div>
      <div className="library-sticky">
        <div className="library-toolbar">
          <span className="library-toolbar-note">{librarySummary(games)}</span>
          <button
            type="button"
            className={`filter-btn${activeCount ? ' active' : ''}`}
            onClick={() => setShowFilters(true)}
            aria-label={activeCount ? `Filters, ${activeCount} active` : 'Filters'}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            <span>Filters</span>
            {activeCount ? <span className="filter-count">{activeCount}</span> : null}
          </button>
        </div>
      </div>

      {loading ? (
        <Skeleton count={6} />
      ) : error ? (
        <MessageState title="Couldn't load your library" error>{error}</MessageState>
      ) : visibleGames.length === 0 ? (
        <MessageState title="No games found">Try a different filter.</MessageState>
      ) : (
        <>
          <div className="game-list">
            {visibleGames.slice(0, visibleCount).map((game, index) => (
              <GameCard key={game.master_id} game={game} onSelect={setSelectedGame} statusMap={statusMap} priority={index === 0} />
            ))}
          </div>
          {visibleGames.length > visibleCount ? (
            <div className="show-more-row">
              <button
                type="button"
                className="show-more-btn"
                onClick={() => setVisibleCount((c) => c + 20)}
              >
                Show more ({visibleGames.length - visibleCount} left)
              </button>
            </div>
          ) : null}
        </>
      )}

      {showFilters ? (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowFilters(false)}>
          <div ref={filterDialogRef} className="modal-sheet filter-sheet" role="dialog" aria-modal="true" aria-label="Filters">
            <div className="modal-handle" />
            <button type="button" className="modal-close" aria-label="Close filters" onClick={() => setShowFilters(false)}>&times;</button>
            <div className="detail-title">Filters</div>

            <div className="filter-group">
              <span className="filter-label">Platform</span>
              <div className="filter-options">
                {PLATFORM_FILTERS.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    className={`filter-opt${platformFilter === o.key ? ' active' : ''}`}
                    onClick={() => setPlatformFilter(o.key)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-label">Status</span>
              <div className="filter-options">
                {STATUS_FILTERS.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    className={`filter-opt${statusFilter === o.key ? ' active' : ''}`}
                    onClick={() => setStatusFilter(o.key)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {genres.length ? (
              <div className="filter-group">
                <span className="filter-label">Genre</span>
                <div className="filter-options">
                  <button
                    type="button"
                    className={`filter-opt${genre === 'any' ? ' active' : ''}`}
                    onClick={() => setGenre('any')}
                  >
                    All genres
                  </button>
                  {genres.map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={`filter-opt${genre === g ? ' active' : ''}`}
                      onClick={() => setGenre(genre === g ? 'any' : g)}
                    >
                      {g.replace(' (RPG)', '')}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Same six categories as Discover and the shuffler, from lib/vibes.js.
                Only chips that can return something are offered. */}
            {vibes.length ? (
              <div className="filter-group">
                <span className="filter-label">Vibe</span>
                <div className="filter-options">
                  <button
                    type="button"
                    className={`filter-opt${vibe === 'any' ? ' active' : ''}`}
                    onClick={() => setVibe('any')}
                  >
                    Any
                  </button>
                  {vibes.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      className={`filter-opt${vibe === v.key ? ' active' : ''}`}
                      onClick={() => setVibe(vibe === v.key ? 'any' : v.key)}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="filter-group">
              <span className="filter-label">Sort by</span>
              <div className="filter-options">
                {SORT_OPTIONS.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    className={`filter-opt${sortKey === o.key ? ' active' : ''}`}
                    onClick={() => setSortKey(o.key)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-sheet-actions">
              <button type="button" className="discover-action" onClick={resetFilters}>
                Reset
              </button>
              <button type="button" className="discover-action primary" onClick={() => setShowFilters(false)}>
                Show {visibleGames.length} {visibleGames.length === 1 ? 'game' : 'games'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedGame ? (
        <GameDetail game={selectedGame} onClose={() => setSelectedGame(null)} />
      ) : null}
    </div>
  )
}
