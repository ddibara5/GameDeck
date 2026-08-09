import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import GameCard from './GameCard.jsx'
import GameDetail from './GameDetail.jsx'
import Skeleton from './Skeleton.jsx'
import HomeShelf from './HomeShelf.jsx'
import { useStatusMap, effectiveStatus } from '../lib/userStatus.js'
import { triggerSync, isSyncLocked } from '../lib/sync.js'
import './library.css'

// Pull-to-refresh tuning.
const PTR_THRESHOLD = 64 // px pulled before a release triggers a sync
const PTR_MAX = 90 // px the indicator can travel
const PTR_RESIST = 0.5 // finger-to-indicator movement ratio

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

  // Pull-to-refresh state.
  const [pull, setPull] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [ptrNote, setPtrNote] = useState('')
  const refreshingRef = useRef(false)

  const loadGames = useCallback(async () => {
    const { data, error: gamesErr } = await supabase
      .from('games')
      .select(GAME_COLUMNS)
      .order('last_played', { ascending: false, nullsFirst: false })
    if (gamesErr) setError(gamesErr.message)
    else {
      setGames(data || [])
      setError(null)
    }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      await loadGames()
      if (alive) setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [loadGames])

  const runRefresh = useCallback(async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    setRefreshing(true)
    if (isSyncLocked()) {
      setPtrNote('A sync is already running.')
    } else {
      setPtrNote('Starting a sync')
      const r = await triggerSync()
      setPtrNote(r.message)
    }
    await loadGames() // reflect anything a prior sync already landed
    setTimeout(() => {
      refreshingRef.current = false
      setRefreshing(false)
      setPtrNote('')
      setPull(0)
    }, 1800)
  }, [loadGames])

  // Pull-to-refresh gesture: pull down from the top of the page to fire a sync.
  useEffect(() => {
    let startY = 0
    let tracking = false

    const atTop = () =>
      (window.scrollY || document.documentElement.scrollTop || 0) <= 0

    const onStart = (e) => {
      if (refreshingRef.current || !atTop()) {
        tracking = false
        return
      }
      const t = e.touches && e.touches[0]
      if (!t) return
      startY = t.clientY
      tracking = true
    }
    const onMove = (e) => {
      if (!tracking || refreshingRef.current) return
      const t = e.touches && e.touches[0]
      if (!t) return
      const dy = t.clientY - startY
      if (dy > 0 && atTop()) {
        if (e.cancelable) e.preventDefault() // suppress native overscroll/reload
        setDragging(true)
        setPull(Math.min(dy * PTR_RESIST, PTR_MAX))
      } else {
        tracking = false
        setDragging(false)
        setPull(0)
      }
    }
    const onEnd = () => {
      if (!tracking) return
      tracking = false
      setDragging(false)
      setPull((p) => {
        if (p >= PTR_THRESHOLD) runRefresh()
        return p >= PTR_THRESHOLD ? p : 0
      })
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [runRefresh])

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

  const ptrVisible = refreshing || pull > 4
  const ptrArmed = pull >= PTR_THRESHOLD
  const ptrY = refreshing ? 52 : Math.min(pull, PTR_MAX)

  return (
    <div>
      <div
        className="ptr"
        style={{
          transform: `translateX(-50%) translateY(${ptrVisible ? ptrY : 0}px)`,
          opacity: ptrVisible ? 1 : 0,
          transition: dragging ? 'none' : 'opacity 0.18s ease, transform 0.2s ease',
        }}
        aria-hidden={!ptrVisible}
      >
        <svg
          className={`ptr-icon${refreshing ? ' spin' : ''}`}
          style={refreshing ? undefined : { transform: `rotate(${Math.min(pull / PTR_THRESHOLD, 1) * 360}deg)` }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12a9 9 0 1 1-2.6-6.4" />
          <path d="M21 3v6h-6" />
        </svg>
        <span className="ptr-text">
          {refreshing ? ptrNote || 'Syncing…' : ptrArmed ? 'Release to sync' : 'Pull to sync'}
        </span>
      </div>

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
