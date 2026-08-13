import { useEffect, useMemo, useState } from 'react'
import GameCard from './GameCard.jsx'
import GameDetail from './GameDetail.jsx'
import Skeleton from './Skeleton.jsx'
import HomeShelf from './HomeShelf.jsx'
import { useStatusMap, effectiveStatus } from '../lib/userStatus.js'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { VIBES, hasVibe, availableVibes } from '../lib/vibes.js'

const PLATFORM_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'xbox', label: 'Xbox' },
  { key: 'psn', label: 'PSN' },
  { key: 'steam', label: 'Steam' },
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
export default function LibraryTab() {
  const { games, loading, error } = useLibraryGames()
  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortKey, setSortKey] = useState('last_played')
  const [vibe, setVibe] = useState('any')
  const [selectedGame, setSelectedGame] = useState(null)
  const [visibleCount, setVisibleCount] = useState(12)
  const statusMap = useStatusMap()

  // Only offer chips that can return something, so tapping one never lands on an
  // empty library. Recomputed from the loaded set rather than hardcoded.
  const vibes = useMemo(() => availableVibes(games), [games])

  const visibleGames = useMemo(() => {
    let list = games

    if (platformFilter !== 'all') {
      list = list.filter((g) => String(g.environment).toLowerCase() === platformFilter)
    }

    if (statusFilter !== 'all') {
      list = list.filter((g) => effectiveStatus(g, statusMap) === statusFilter)
    }

    if (vibe !== 'any') {
      list = list.filter((g) => hasVibe(g, vibe))
    }

    const query = search.trim().toLowerCase()
    if (query) {
      list = list.filter((g) => g.title?.toLowerCase().includes(query))
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
  }, [games, platformFilter, statusFilter, vibe, search, sortKey, statusMap])

  // Reset the visible window whenever the filter/search/sort changes.
  useEffect(() => {
    setVisibleCount(12)
  }, [platformFilter, statusFilter, vibe, search, sortKey])

  return (
    <div>
      <div className="library-sticky">
        <input
          type="search"
          className="search-input"
          placeholder="Search your library"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search games"
        />
        <div className="sort-row">
          <select
            className="sort-select"
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            aria-label="Filter by platform"
          >
            <option value="all">Platform: All</option>
            <option value="xbox">Xbox</option>
            <option value="psn">PSN</option>
            <option value="steam">Steam</option>
          </select>
          <select
            className="sort-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="all">Status: All</option>
            <option value="playing">Playing</option>
            <option value="backlog">Backlog</option>
            <option value="finished">Finished</option>
            <option value="abandoned">Abandoned</option>
          </select>
          <select
            className="sort-select"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            aria-label="Sort games"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                Sort: {opt.label}
              </option>
            ))}
          </select>
        </div>
        {vibes.length ? (
          <div className="vibe-row">
            <button
              type="button"
              className={`vibe-chip${vibe === 'any' ? ' on' : ''}`}
              onClick={() => setVibe('any')}
            >
              All
            </button>
            {vibes.map((v) => (
              <button
                key={v.key}
                type="button"
                className={`vibe-chip${vibe === v.key ? ' on' : ''}`}
                onClick={() => setVibe(vibe === v.key ? 'any' : v.key)}
              >
                {v.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {!loading && !error && search.trim() === '' && platformFilter === 'all' && statusFilter === 'all' && vibe === 'any' ? (
        <HomeShelf games={games} onSelect={setSelectedGame} />
      ) : null}

      {loading ? (
        <Skeleton count={6} />
      ) : error ? (
        <div className="empty-state">
          <div className="empty-state-title">Couldn't load your library</div>
          <div>{error}</div>
        </div>
      ) : visibleGames.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No games found</div>
          <div>Try a different search or filter.</div>
        </div>
      ) : (
        <>
          <div className="game-list">
            {visibleGames.slice(0, visibleCount).map((game) => (
              <GameCard key={game.master_id} game={game} onSelect={setSelectedGame} statusMap={statusMap} />
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

      {selectedGame ? (
        <GameDetail game={selectedGame} onClose={() => setSelectedGame(null)} />
      ) : null}
    </div>
  )
}
