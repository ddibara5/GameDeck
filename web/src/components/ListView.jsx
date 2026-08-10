import { useMemo, useState } from 'react'
import GameCard from './GameCard.jsx'
import GameDetail from './GameDetail.jsx'
import Skeleton from './Skeleton.jsx'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { useStatusMap, effectiveStatus, includeInLists } from '../lib/userStatus.js'
import { useLibraryPrefs, passesYear } from '../lib/libraryPrefs.js'
import './wishlist.css'

export const BEST_MIN_RATING = 85

// Every drawer-opened list. `filter` runs against a game with the live status map;
// `sort` is optional (defaults to the fetch order, i.e. last played first).
export const LIST_DEFS = {
  'status:backlog': {
    title: 'Backlog',
    filter: (g, m) => effectiveStatus(g, m) === 'backlog',
    empty: 'Games you haven’t started yet will show up here.',
  },
  'status:playing': {
    title: 'Playing',
    filter: (g, m) => effectiveStatus(g, m) === 'playing',
    empty: 'Games you’re in the middle of will show up here.',
  },
  'status:finished': {
    title: 'Finished',
    filter: (g, m) => effectiveStatus(g, m) === 'finished',
    empty: 'Games you’ve completed will show up here.',
  },
  'status:abandoned': {
    title: 'Abandoned',
    filter: (g, m) => effectiveStatus(g, m) === 'abandoned',
    empty: 'Games you’ve set aside will show up here.',
  },
  'smart:best-backlog': {
    title: 'Best of your backlog',
    subtitle: `Backlog rated ${BEST_MIN_RATING}+ on IGDB`,
    filter: (g, m) => effectiveStatus(g, m) === 'backlog' && Number(g.igdb_rating) >= BEST_MIN_RATING,
    sort: (a, b) => (Number(b.igdb_rating) || 0) - (Number(a.igdb_rating) || 0),
    empty: 'Highly rated games in your backlog appear here as ratings sync in.',
  },
}

export default function ListView({ viewKey, onClose }) {
  const def = LIST_DEFS[viewKey]
  const { games, loading, error } = useLibraryGames()
  const statusMap = useStatusMap()
  const prefs = useLibraryPrefs()
  const [selectedGame, setSelectedGame] = useState(null)

  const list = useMemo(() => {
    if (!def) return []
    const filtered = games.filter(
      (g) =>
        includeInLists(g, statusMap) &&
        !prefs.hidden.has(String(g.master_id)) &&
        passesYear(g, prefs.hideBeforeYear) &&
        def.filter(g, statusMap)
    )
    return def.sort ? [...filtered].sort(def.sort) : filtered
  }, [def, games, statusMap, prefs])

  if (!def) return null

  const count = list.length
  const sub = def.subtitle || `${count} ${count === 1 ? 'game' : 'games'}`

  return (
    <div className="wl-page">
      <div className="wl-head">
        <button type="button" className="wl-back" onClick={onClose} aria-label="Back">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div>
          <div className="wl-title">{def.title}</div>
          <div className="wl-sub">{loading ? 'Loading…' : sub}</div>
        </div>
      </div>

      {loading ? (
        <Skeleton count={6} />
      ) : error ? (
        <div className="empty-state">
          <div className="empty-state-title">Couldn’t load your library</div>
          <div>{error}</div>
        </div>
      ) : count === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">Nothing here yet</div>
          <div>{def.empty}</div>
        </div>
      ) : (
        <div className="game-list">
          {list.map((game) => (
            <GameCard key={game.master_id} game={game} onSelect={setSelectedGame} statusMap={statusMap} />
          ))}
        </div>
      )}

      {selectedGame ? <GameDetail game={selectedGame} onClose={() => setSelectedGame(null)} /> : null}
    </div>
  )
}
