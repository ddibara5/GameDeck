import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import LibraryGameCard from './LibraryGameCard.jsx'
import FilterBuilder, { singleFilter } from './FilterBuilder.jsx'
import GameDetail from './GameDetail.jsx'
import Skeleton from './Skeleton.jsx'
import { MessageState } from './AsyncState.jsx'
import { useStatusMap, effectiveStatus } from '../lib/userStatus.js'
import { useLibraryGames, useVibeKeywords } from '../lib/useLibraryGames.js'
import { hasVibe, availableVibes } from '../lib/vibes.js'
import { topGenres } from '../lib/gameGenres.js'
import { useDialogA11y } from '../lib/useDialogA11y.js'
import { lockScroll } from '../lib/scrollLock.js'
import { libraryProgress as storyProgress } from '../lib/libraryPresentation.js'
import { groupLibraryGames } from '../lib/gameGroups.js'
import './library.css'

// Matches the Expo pilot's status model: backlog / playing / finished are computed
// from your activity (see userStatus.derivedStatus, the pilot's derivedGameStatus),
// while any of the four - including 'abandoned' - can be an explicit override in
// the game_status table. effectiveStatus checks the override map first, so a game
// you marked Abandoned in the pilot shows up under that chip here too.
const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'playing', label: 'Playing' },
  { key: 'backlog', label: 'Backlog' },
  { key: 'finished', label: 'Finished' },
  { key: 'abandoned', label: 'Abandoned' },
]

// Same four buckets as the pilot (its text match on the platforms array), plus
// the local environment key as a belt-and-suspenders match: the PWA rows always
// carry `environment` ('xbox' | 'psn' | 'steam'), the pilot only had `platforms`.
const PLATFORM_FILTERS = [
  { key: 'all', label: 'All platforms' },
  { key: 'xbox', label: 'Xbox' },
  { key: 'playstation', label: 'PlayStation' },
  { key: 'pc', label: 'PC' },
]

function platformMatches(game, filter) {
  if (filter === 'all') return true
  const env = String(game.environment || '').toLowerCase()
  const text = (game.platforms ?? []).join(' ').toLowerCase()
  if (filter === 'xbox') return env === 'xbox' || text.includes('xbox')
  if (filter === 'playstation') {
    return env === 'psn' || text.includes('playstation') || /\bps\d/.test(text)
  }
  if (filter === 'pc') {
    return (
      env === 'steam' ||
      text.includes('pc') ||
      text.includes('steam') ||
      text.includes('windows')
    )
  }
  return true
}

// The pilot's sort list, in its order: Recent, A-Z, Playtime, Progress,
// Achievements. "Progress" is the pilot's libraryProgress: story progress (your
// playtime vs the game's length) when a length is known, achievement percent as
// the fallback for games with no known length (MMOs / no IGDB match). This
// replaced the old "Completion %" sort, which was achievement percent only.
const SORT_OPTIONS = [
  { key: 'recent', label: 'Recent' },
  { key: 'title', label: 'Title A-Z' },
  { key: 'playtime', label: 'Playtime' },
  { key: 'progress', label: 'Progress' },
  { key: 'achievements', label: 'Achievements' },
]

const VIEW_OPTIONS = [
  { key: 'grid', label: 'Large' },
  { key: 'compact', label: 'Small' },
  { key: 'list', label: 'List' },
]

export default function LibraryTab() {
  const { games: libraryGames, loading, error } = useLibraryGames()
  // One tile per game: rows that are the same title on several consoles or
  // ecosystems collapse into one tile; the versions stay listed in the detail
  // sheet. Display-layer grouping only, no data is merged or deleted.
  const games = useMemo(() => groupLibraryGames(libraryGames), [libraryGames])
  const [query, setQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortKey, setSortKey] = useState('recent')
  const [view, setView] = useState('compact')
  const [vibe, setVibe] = useState('any')
  const [genre, setGenre] = useState('any')
  const [showSearch, setShowSearch] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filterResetKey, setFilterResetKey] = useState(0)
  const [showView, setShowView] = useState(false)
  const closeControls = () => { setShowFilters(false); setShowView(false) }
  const controlsOpen = showFilters || showView
  const filterDialogRef = useDialogA11y({ active: controlsOpen, onClose: closeControls })
  useEffect(() => {
    if (controlsOpen) return lockScroll()
  }, [controlsOpen])
  const [selectedGame, setSelectedGame] = useState(null)
  const [visibleCount, setVisibleCount] = useState(12)
  const statusMap = useStatusMap()

  // The effective status: explicit game_status override first, activity-derived
  // second. This is the pilot's statusFor, and the chips below read it.
  const statusFor = useCallback((game) => effectiveStatus(game, statusMap), [statusMap])

  // Status chips show counts like the pilot's, so "Abandoned 3" tells you the
  // filter is worth tapping before you tap it.
  const statusCounts = useMemo(() => {
    const counts = { all: games.length, playing: 0, backlog: 0, finished: 0, abandoned: 0 }
    for (const game of games) {
      const s = statusFor(game)
      if (counts[s] != null) counts[s] += 1
    }
    return counts
  }, [games, statusFor])

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
    (query.trim() ? 1 : 0) +
    (platformFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (genre !== 'any' ? 1 : 0) +
    (vibe !== 'any' ? 1 : 0)

  function resetFilters() {
    setFilterResetKey((value) => value + 1)
    setQuery('')
    setPlatformFilter('all')
    setStatusFilter('all')
    setGenre('any')
    setVibe('any')
    setSortKey('recent')
  }

  const visibleGames = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = games

    if (q) {
      list = list.filter((g) => (g.title || '').toLowerCase().includes(q))
    }

    if (platformFilter !== 'all') {
      list = list.filter((g) => platformMatches(g, platformFilter))
    }

    if (statusFilter !== 'all') {
      list = list.filter((g) => statusFor(g) === statusFilter)
    }

    if (genre !== 'any') {
      list = list.filter((g) => g.genre === genre)
    }

    if (vibe !== 'any') {
      list = list.filter((g) => hasVibe(g, vibe, kwMap))
    }

    // The pilot breaks every sort tie on title A-Z, so equal rows never shuffle
    // between renders.
    const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '')
    const sorted = [...list]
    switch (sortKey) {
      case 'title':
        sorted.sort(byTitle)
        break
      case 'playtime':
        sorted.sort((a, b) => (b.playtime_minutes || 0) - (a.playtime_minutes || 0) || byTitle(a, b))
        break
      case 'progress':
        sorted.sort((a, b) => storyProgress(b) - storyProgress(a) || byTitle(a, b))
        break
      case 'achievements':
        sorted.sort((a, b) => (b.earned_awards || 0) - (a.earned_awards || 0) || byTitle(a, b))
        break
      case 'recent':
      default:
        sorted.sort((a, b) => {
          const ta = a.last_played ? new Date(a.last_played).getTime() : 0
          const tb = b.last_played ? new Date(b.last_played).getTime() : 0
          if (Number.isNaN(ta) && Number.isNaN(tb)) return byTitle(a, b)
          if (Number.isNaN(ta)) return 1
          if (Number.isNaN(tb)) return -1
          return tb - ta || byTitle(a, b)
        })
        break
    }
    return sorted
    // kwMap is a dependency: the vibe filter reads it, and it arrives after the
    // first render. Without it here, picking a vibe before the keywords land
    // would filter against an empty map and never recompute.
  }, [games, query, platformFilter, statusFilter, genre, vibe, sortKey, statusFor, kwMap])

  // Reset the visible window whenever the filter/search/sort/view changes.
  useEffect(() => {
    setVisibleCount(12)
  }, [query, platformFilter, statusFilter, genre, vibe, sortKey, view])

  const summary = useMemo(() => {
    if (!games.length) return ''
    if (activeCount > 0) {
      return `${visibleGames.length.toLocaleString()} of ${games.length.toLocaleString()} games`
    }
    return `${games.length.toLocaleString()} games`
  }, [games, visibleGames.length, activeCount])

  return (
    <div className="gd-lib">
      <div className="library-sticky">
        <div className="gd-library-toolbar">
          <h2 className="gd-library-count" aria-live="polite">{summary || (loading ? 'Loading games…' : '0 games')}</h2>
          <div className="gd-library-tools">
            <button type="button" className="gd-icon-button" aria-label="Search library" aria-expanded={showSearch} aria-controls="library-search" onClick={() => setShowSearch(!showSearch)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7.5" /><path d="m16 16 5 5" /></svg>
            </button>
            <button type="button" className="gd-icon-button" aria-label="Library view and sort" aria-haspopup="dialog" onClick={() => setShowView(true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="7" rx="1" /><rect x="3" y="14" width="18" height="7" rx="1" /></svg>
            </button>
            <button type="button" className={`gd-icon-button${activeCount ? ' active' : ''}`} aria-label={activeCount ? `Filters, ${activeCount} active` : 'Filters'} aria-haspopup="dialog" onClick={() => setShowFilters(true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M6 12h12M9 18h6" /></svg>
              {activeCount ? <span className="gd-filter-count">{activeCount}</span> : null}
            </button>
          </div>
        </div>
        {showSearch && (
          <div id="library-search" className="gd-search-wrap">
            <input type="search" name="library-search" className="search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your library" aria-label="Search your library" autoComplete="off" enterKeyHint="search" autoFocus={showSearch} />
            {query ? <button type="button" className="gd-clear" onClick={() => setQuery('')} aria-label="Clear search">&times;</button> : null}
          </div>
        )}

        <div className="chip-row gd-chip-row" role="group" aria-label="Status filters">
          {STATUS_FILTERS.filter((o) => o.key !== 'abandoned' || statusCounts.abandoned > 0 || statusFilter === 'abandoned').map((o) => (
            <button
              key={o.key}
              type="button"
              className={`chip${statusFilter === o.key ? ' active' : ''}`}
              aria-pressed={statusFilter === o.key}
              onClick={() => setStatusFilter(o.key)}
            >
              {o.label}
              <span className="gd-chip-count">{(statusCounts[o.key] || 0).toLocaleString()}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Skeleton count={6} />
      ) : error ? (
        <MessageState title="Couldn't load your library" error>{error}</MessageState>
      ) : visibleGames.length === 0 ? (
        <MessageState title="No games found">Try a different search or filter.</MessageState>
      ) : (
        <>
          <div className={view === 'grid' ? 'gd-library-grid' : 'gd-library-list'}>
            {visibleGames.slice(0, visibleCount).map((game, index) => (
              <LibraryGameCard key={game.master_id} game={game} onSelect={setSelectedGame} statusMap={statusMap} view={view} priority={index === 0} />
            ))}
          </div>
          {visibleGames.length > visibleCount ? (
            <div className="show-more-row">
              <button type="button" className="show-more-btn" onClick={() => setVisibleCount((c) => c + 20)}>
                Show more ({visibleGames.length - visibleCount} left)
              </button>
            </div>
          ) : null}
        </>
      )}

      {showView ? createPortal(
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && closeControls()}>
          <div ref={filterDialogRef} className="modal-sheet filter-sheet gd-library-sheet" role="dialog" aria-modal="true" aria-label="Library view and sort">
            <div className="modal-handle" />
            <button type="button" className="modal-close" aria-label="Close view and sort" onClick={closeControls}>&times;</button>
            <div className="detail-title">View and sort</div>
            <div className="filter-group">
              <span className="filter-label">Artwork</span>
              <div className="filter-options">
                {VIEW_OPTIONS.map((o) => (
                  <button key={o.key} type="button" className={`filter-opt${view === o.key ? ' active' : ''}`} aria-pressed={view === o.key} onClick={() => setView(o.key)}>{o.label}</button>
                ))}
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-label">Sort by</span>
              <div className="filter-options">
                {SORT_OPTIONS.map((o) => (
                  <button key={o.key} type="button" className={`filter-opt${sortKey === o.key ? ' active' : ''}`} aria-pressed={sortKey === o.key} onClick={() => setSortKey(o.key)}>{o.label}</button>
                ))}
              </div>
            </div>
            <button type="button" className="discover-action primary" onClick={closeControls}>Done</button>
          </div>
        </div>, document.body,
      ) : null}

      {showFilters ? createPortal(
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowFilters(false)}>
          <div ref={filterDialogRef} className="modal-sheet filter-sheet discover-filter-sheet gd-library-sheet gd-library-filter-sheet" role="dialog" aria-modal="true" aria-label="Library filters">
            <div className="modal-handle" />
            <button type="button" className="modal-close" aria-label="Close filters" onClick={() => setShowFilters(false)}>&times;</button>
            <div className="filter-sheet-head">
              <div className="detail-title">Library filters</div>
            </div>
            <div className="filter-sheet-scroll">
              <FilterBuilder key={filterResetKey} fields={[
                singleFilter('status', 'Status', statusFilter, 'all', STATUS_FILTERS.map(({ key, label }) => ({ value: key, label })), setStatusFilter),
                singleFilter('platform', 'Platform', platformFilter, 'all', PLATFORM_FILTERS.map(({ key, label }) => ({ value: key, label })), setPlatformFilter),
                ...(genres.length ? [singleFilter('genre', 'Genre', genre, 'any', [
                  { value: 'any', label: 'All genres' },
                  ...genres.map((value) => ({ value, label: value.replace(' (RPG)', '') })),
                ], setGenre)] : []),
                ...(vibes.length ? [singleFilter('vibe', 'Vibe', vibe, 'any', [
                  { value: 'any', label: 'Any vibe' },
                  ...vibes.map(({ key, label }) => ({ value: key, label })),
                ], setVibe)] : []),
                ...(query.trim() ? [{
                  id: 'search', label: 'Title search', active: true, summary: query,
                  onRemove: () => setQuery(''),
                  editor: <input className="search-input" aria-label="Filter by game title" value={query} onChange={(event) => setQuery(event.target.value)} />,
                }] : []),
              ]} />
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
        </div>, document.body,
      ) : null}

      {selectedGame ? (
        <GameDetail game={selectedGame} onClose={() => setSelectedGame(null)} />
      ) : null}
    </div>
  )
}
