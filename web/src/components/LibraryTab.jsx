import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import GameCard from './GameCard.jsx'
import GameDetail from './GameDetail.jsx'
import Skeleton from './Skeleton.jsx'
import HomeShelf from './HomeShelf.jsx'
import { useStatusMap, effectiveStatus } from '../lib/userStatus.js'

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

const GAME_COLUMNS =
  'master_id, environment, title, platforms, earned_awards, total_awards, percent, ' +
  'earned_points, earned_exp, playtime_minutes, playtime_label, status, beaten, ' +
  'last_played, first_played, completion_date, cover_small, cover_standard, cover_tile, ' +
  'achievements_url, updated_at, length_minutes, genre, release_year, cover_igdb'

export default function LibraryTab() {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortKey, setSortKey] = useState('last_played')
  const [selectedGame, setSelectedGame] = useState(null)
  const [visibleCount, setVisibleCount] = useState(12)
  const statusMap = useStatusMap()

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const { data, error: gamesErr } = await supabase
        .from('games')
        .select(GAME_COLUMNS)
        .order('last_played', { ascending: false, nullsFirst: false })

      if (cancelled) return

      if (gamesErr) {
        setError(gamesErr.message)
      } else {
        setGames(data || [])
      }

      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const visibleGames = useMemo(() => {
    let list = games

    if (platformFilter !== 'all') {
      list = list.filter((g) => String(g.environment).toLowerCase() === platformFilter)
    }

    if (statusFilter !== 'all') {
      list = list.filter((g) => effectiveStatus(g, statusMap) === statusFilter)
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
  }, [games, platformFilter, statusFilter, search, sortKey, statusMap])

  // Reset the visible window whenever the filter/search/sort changes.
  useEffect(() => {
    setVisibleCount(12)
  }, [platformFilter, statusFilter, search, sortKey])

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
      </div>

      {!loading && !error && search.trim() === '' && platformFilter === 'all' && statusFilter === 'all' ? (
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
