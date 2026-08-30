import { useMemo, useState } from 'react'
import GameCard from './GameCard.jsx'
import GameDetail from './GameDetail.jsx'
import Skeleton from './Skeleton.jsx'
import { MessageState } from './AsyncState.jsx'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { useStatusMap, effectiveStatus, includeInLists } from '../lib/userStatus.js'
import './wishlist.css'

// Drawer-opened status lists. `filter` runs against a game with the live status map.
export const LIST_DEFS = {
  // Derived, not stored: `backlog` is what effectiveStatus returns when nothing
  // has been decided and nothing has been played, so this list and the Home tile
  // are reading the same rule and cannot disagree.
  'status:backlog': {
    title: 'Backlog',
    filter: (g, m) => effectiveStatus(g, m) === 'backlog',
    empty: 'Games you own and have not really started will show up here.',
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
}

export default function ListView({ viewKey, onClose }) {
  const def = LIST_DEFS[viewKey]
  const { games, loading, error } = useLibraryGames()
  const statusMap = useStatusMap()
  const [selectedGame, setSelectedGame] = useState(null)

  const list = useMemo(() => {
    if (!def) return []
    return games.filter((g) => includeInLists(g, statusMap) && def.filter(g, statusMap))
  }, [def, games, statusMap])

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
          {/* An h1 since 21 Aug. The tabs no longer carry one and the header
              blanks its own while this overlay is up, so without this the screen
              would have no heading at all. */}
          <h1 className="wl-title">{def.title}</h1>
          <div className="wl-sub">{loading ? 'Loading…' : sub}</div>
        </div>
      </div>

      {loading ? (
        <Skeleton count={6} />
      ) : error ? (
        <MessageState title="Couldn’t load your library" error>{error}</MessageState>
      ) : count === 0 ? (
        <MessageState title="Nothing here yet">{def.empty}</MessageState>
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
