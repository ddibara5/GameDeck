import { useMemo, useState } from 'react'
import Cover from './Cover.jsx'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { igdbCover } from '../lib/format.js'

// The picker behind Settings > Background > Pinned game.
//
// NOT the shuffler. The brainstorm said "opens the same picker the shuffler uses"
// and the shuffler is not a picker: it is a swipe deck that hands you ONE game at
// a time by pools, genre, vibe and length, which is the opposite of the job here.
// Pinning is "find the game I already have in mind", and that is a search field
// over a list. Reusing ShufflePicker would also have pulled the Game Pass catalog,
// the wishlist, the keyword sidecar and GameSheet into Settings for a title match.
//
// Only rows with an igdb_id are offered. 34 of 513 library rows have none, and for
// those there is no artwork to be the background - listing them would let you pin a
// game and get a flat page with no explanation.

const LIMIT = 40

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export default function GamePinPicker({ pinnedId, onPick }) {
  const { games, loading } = useLibraryGames()
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    const withArt = (games || []).filter((g) => g && g.igdb_id)
    const needle = norm(q)
    // Empty search shows the most recently played rather than the alphabetical
    // top of 479 games, because the game you want to pin is nearly always one you
    // have been playing, and "1080 Snowboarding" never is.
    const pool = needle ? withArt.filter((g) => norm(g.title).includes(needle)) : withArt
    const sorted = needle
      ? [...pool].sort((a, b) => norm(a.title).indexOf(needle) - norm(b.title).indexOf(needle))
      : [...pool].sort((a, b) => new Date(b.last_played || 0) - new Date(a.last_played || 0))
    return sorted.slice(0, LIMIT)
  }, [games, q])

  const total = (games || []).filter((g) => g && g.igdb_id).length

  return (
    <>
      <div className="pin-search">
        <input
          type="search"
          className="search-input"
          placeholder="Search your library"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search games to pin"
        />
      </div>

      {loading && !rows.length ? <p className="settings-note">Loading your library.</p> : null}

      {!loading && !rows.length ? (
        <p className="settings-note">
          {q ? `Nothing in your library matches "${q}".` : 'No games with key art yet.'}
        </p>
      ) : null}

      {rows.length ? (
        <div className="settings-group">
          {rows.map((g) => (
            <button
              key={g.master_id}
              type="button"
              className={`pin-row${String(g.master_id) === String(pinnedId) ? ' on' : ''}`}
              onClick={() => onPick(g)}
              aria-pressed={String(g.master_id) === String(pinnedId)}
            >
              <Cover
                src={g.cover_igdb ? igdbCover(g.cover_igdb, 't_cover_big') : g.cover_small}
                title={g.title}
                className="pin-cover"
              />
              <span className="pin-label">
                {g.title}
                {g.release_year ? <span className="pin-sub">{g.release_year}</span> : null}
              </span>
              {String(g.master_id) === String(pinnedId) ? (
                <svg
                  className="pin-check"
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m5 12.5 4.5 4.5L19 7" />
                </svg>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {/* Said outright rather than paginated. A pin is one game, the search field
          is right there, and an infinite scroll through 479 rows to choose one is
          a worse answer than a sentence. */}
      {!q && total > LIMIT ? (
        <p className="settings-note">
          The {LIMIT} you played most recently. Search to reach the other {total - LIMIT}.
        </p>
      ) : null}
    </>
  )
}
