import { useCallback, useEffect, useMemo, useState } from 'react'
import GameCard from './GameCard.jsx'
import GameDetail from './GameDetail.jsx'
import Skeleton from './Skeleton.jsx'
import Cover from './Cover.jsx'
import CompletionBar from './CompletionBar.jsx'
import { MessageState } from './AsyncState.jsx'
import { useStatusMap, effectiveStatus, STATUS_LABELS } from '../lib/userStatus.js'
import { platformMeta, libraryCover } from '../lib/format.js'
import { useLibraryGames, useVibeKeywords } from '../lib/useLibraryGames.js'
import { hasVibe, availableVibes } from '../lib/vibes.js'
import { topGenres } from '../lib/gameGenres.js'
import { useDialogA11y } from '../lib/useDialogA11y.js'
import { preloadGameSheet } from './LazyGameSheet.jsx'

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

const STATUS_LABEL = { ...STATUS_LABELS, abandoned: 'Abandoned' }

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

function storyProgress(game) {
  const len = Number(game.length_minutes) || 0
  if (len > 0) return Math.min(100, Math.max(0, ((game.playtime_minutes || 0) / len) * 100))
  return Math.min(100, Math.max(0, Number(game.percent) || 0))
}

// The library query used to live here as a second, private column list. It had
// already drifted from the shared one, missing `keywords` and `igdb_rating`, which
// would have made every vibe chip below return nothing while looking perfectly
// healthy. Same shape of bug as the missing `igdb_id` that silently killed the
// shuffler's Game Pass weighting. One list, one fetch, in useLibraryGames.

// Subtitle under the large title. Deliberately two facts rather than a stat
// block: how big the library is, and how big the pile you have not started is.
// An empty or still-loading library gets no line at all rather than "0 games",
// which reads like the fetch failed. When a search or filter narrows the list it
// switches to "N of M games" so a narrow list reads as filtered, not missing.
function librarySummary(games) {
  if (!games || !games.length) return ''
  const unplayed = games.filter((g) => !g.playtime_minutes).length
  const total = `${games.length.toLocaleString()} games`
  return unplayed ? `${total} · ${unplayed} unplayed` : total
}

// Grid tile for the grid view: cover, title, platform + status line, story
// progress. Tapping opens the same GameDetail sheet the compact rows open.
function GridGameCard({ game, onSelect, statusMap }) {
  const { label } = platformMeta(game.environment)
  const status = effectiveStatus(game, statusMap)
  const len = Number(game.length_minutes) || 0
  const statusLabel = STATUS_LABEL[status] || status
  return (
    <button
      type="button"
      className="gd-grid-card"
      onPointerDown={preloadGameSheet}
      onFocus={preloadGameSheet}
      onClick={() => onSelect(game)}
      aria-label={`${game.title}, ${label}, ${statusLabel}`}
    >
      <Cover src={libraryCover(game)} title={game.title} size="sm" />
      <span className="gd-grid-title">{game.title}</span>
      <span className="gd-grid-meta">
        {label} · {statusLabel}
      </span>
      {len > 0 ? (
        <CompletionBar percent={Math.round(storyProgress(game))} />
      ) : (
        <span className="gd-grid-meta">
          {game.earned_awards ?? 0}/{game.total_awards ?? 0} achievements
        </span>
      )}
    </button>
  )
}

// Styles that exist only for this tab's pilot-parity additions (search row, view
// toggle, status chips, grid). Everything else reuses the app's shared classes.
// Kept here instead of index.css because the rebuild contract covers only this
// file; the class names are gd- prefixed so they cannot collide.
const LIBRARY_STYLES = `
.gd-lib { max-width: 430px; margin: 0 auto; width: 100%; padding-bottom: var(--safe-bottom); }
.gd-search-row { display: flex; gap: 8px; margin-top: 10px; }
.gd-search-wrap { position: relative; flex: 1; min-width: 0; }
.gd-search-wrap .search-input { padding-right: 44px; }
.gd-clear {
  position: absolute; right: 2px; top: 2px;
  width: 40px; height: calc(100% - 4px);
  display: flex; align-items: center; justify-content: center;
  background: none; border: 0; border-radius: var(--r-sm);
  color: var(--muted); font-size: 20px; line-height: 1; cursor: pointer;
}
.gd-clear:active { color: var(--text); }
.gd-view-toggle {
  display: flex; flex: 0 0 auto;
  border: 1px solid var(--line); border-radius: var(--r-sm);
  background: var(--surface); overflow: hidden;
}
.gd-view-toggle button {
  min-height: 44px; min-width: 44px; padding: 0 12px;
  background: none; border: 0; color: var(--muted);
  font-size: var(--t-foot); font-weight: var(--w-semi); cursor: pointer;
  white-space: nowrap;
}
.gd-view-toggle button + button { border-left: 1px solid var(--line); }
.gd-view-toggle button.active { background: var(--accent); color: var(--bg); }
.gd-chip-row .chip { min-height: 44px; }
.gd-chip-count { margin-left: 6px; opacity: 0.75; font-variant-numeric: tabular-nums; }
.gd-grid {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 12px; margin: 0 var(--screen-gutter) var(--space-5);
}
.gd-grid-card {
  display: flex; flex-direction: column; align-items: stretch; gap: 6px;
  background: none; border: 0; padding: 0; margin: 0;
  min-height: 44px; text-align: left; cursor: pointer; min-width: 0;
}
.gd-grid-card:active { opacity: 0.72; }
.gd-grid-card .cover.cover-sm { width: 100%; height: auto; aspect-ratio: 3 / 4; font-size: 44px; }
.gd-grid-title {
  font-size: var(--t-sub); font-weight: var(--w-semi); color: var(--text);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.gd-grid-meta { font-size: var(--t-cap); color: var(--muted); }
`

export default function LibraryTab() {
  const { games, loading, error } = useLibraryGames()
  const [query, setQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortKey, setSortKey] = useState('recent')
  const [view, setView] = useState('compact')
  const [vibe, setVibe] = useState('any')
  const [genre, setGenre] = useState('any')
  const [showFilters, setShowFilters] = useState(false)
  const filterDialogRef = useDialogA11y({ active: showFilters, onClose: () => setShowFilters(false) })
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
    return librarySummary(games)
  }, [games, visibleGames.length, activeCount])

  return (
    <div className="gd-lib">
      <style>{LIBRARY_STYLES}</style>
      <div className="library-sticky">
        <div className="library-toolbar">
          <span className="library-toolbar-note">{summary}</span>
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

        <div className="gd-search-row">
          <div className="gd-search-wrap">
            <input
              type="search"
              className="search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your library"
              aria-label="Search your library"
              autoComplete="off"
              enterKeyHint="search"
            />
            {query ? (
              <button type="button" className="gd-clear" onClick={() => setQuery('')} aria-label="Clear search">
                &times;
              </button>
            ) : null}
          </div>
          <div className="gd-view-toggle" role="group" aria-label="Library view">
            <button
              type="button"
              className={view === 'compact' ? 'active' : ''}
              aria-pressed={view === 'compact'}
              onClick={() => setView('compact')}
            >
              Compact
            </button>
            <button
              type="button"
              className={view === 'grid' ? 'active' : ''}
              aria-pressed={view === 'grid'}
              onClick={() => setView('grid')}
            >
              Grid
            </button>
          </div>
        </div>

        <div className="chip-row gd-chip-row" role="group" aria-label="Status filters">
          {STATUS_FILTERS.map((o) => (
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
      ) : view === 'grid' ? (
        <>
          <div className="gd-grid">
            {visibleGames.slice(0, visibleCount).map((game) => (
              <GridGameCard key={game.master_id} game={game} onSelect={setSelectedGame} statusMap={statusMap} />
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
