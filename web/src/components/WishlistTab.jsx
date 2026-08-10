import { useEffect, useMemo, useState } from 'react'
import Cover from './Cover.jsx'
import GameSheet from './GameSheet.jsx'
import { useWishlist, removeFromWishlist, reconcileWishlist } from '../lib/wishlist.js'
import { loadLibraryTitles } from '../lib/discover.js'
import './wishlist.css'

const CURRENT_YEAR = new Date().getFullYear()

export default function WishlistTab({ onClose }) {
  const { items, loading } = useWishlist()
  const [reconciled, setReconciled] = useState([])
  const [noteDismissed, setNoteDismissed] = useState(false)
  const [selected, setSelected] = useState(null)

  // Once on open: drop anything that has since landed in the synced library.
  useEffect(() => {
    let alive = true
    loadLibraryTitles()
      .then((set) => reconcileWishlist(set))
      .then((removed) => {
        if (alive && removed.length) setReconciled(removed)
      })
    return () => {
      alive = false
    }
  }, [])

  const { soon, rest } = useMemo(() => {
    const soon = []
    const rest = []
    for (const r of items) {
      if (r.year && r.year >= CURRENT_YEAR) soon.push(r)
      else rest.push(r)
    }
    return { soon, rest }
  }, [items])

  const back = (
    <button type="button" className="wl-back" onClick={onClose} aria-label="Back">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  )

  function Row({ r }) {
    const upcoming = r.year && r.year >= CURRENT_YEAR
    return (
      <div
        className="wl-row"
        role="button"
        tabIndex={0}
        style={{ cursor: 'pointer' }}
        onClick={() => setSelected(r)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setSelected(r)
          }
        }}
      >
        <Cover src={r.cover} title={r.title} size="sm" className="wish-cover" />
        <div className="wl-rb">
          <div className="wl-rt">{r.title}</div>
          <div className="wl-rm">
            <span>{r.year || 'TBA'}</span>
            {upcoming ? <span className="wl-soon">Coming soon</span> : null}
          </div>
        </div>
        <button
          type="button"
          className="wl-remove"
          aria-label={`Remove ${r.title}`}
          onClick={(e) => {
            e.stopPropagation()
            removeFromWishlist(r.igdb_id)
          }}
        >
          &times;
        </button>
      </div>
    )
  }

  return (
    <div className="wl-page">
      <div className="wl-head">
        {back}
        <div>
          <div className="wl-title">Wishlist</div>
          <div className="wl-sub">{loading ? 'Loading…' : `${items.length} ${items.length === 1 ? 'game' : 'games'} you're tracking`}</div>
        </div>
      </div>

      {reconciled.length && !noteDismissed ? (
        <div className="wl-note">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span>
            {reconciled.length === 1 ? (
              <><b>{reconciled[0].title}</b> showed up in your library, so it left the wishlist.</>
            ) : (
              <><b>{reconciled.length} games</b> showed up in your library and left the wishlist.</>
            )}
          </span>
          <button type="button" className="wl-note-x" onClick={() => setNoteDismissed(true)} aria-label="Dismiss">&times;</button>
        </div>
      ) : null}

      {!loading && items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">Your wishlist is empty</div>
          <div>Tap the heart on any game in Discover to start tracking it.</div>
        </div>
      ) : null}

      {soon.length ? (
        <>
          <div className="wl-group amber">Releasing soon</div>
          {soon.map((r) => <Row key={r.igdb_id} r={r} />)}
        </>
      ) : null}

      {rest.length ? (
        <>
          {soon.length ? <div className="wl-group">All saved</div> : null}
          {rest.map((r) => <Row key={r.igdb_id} r={r} />)}
        </>
      ) : null}

      {selected ? (
        <GameSheet variant="wishlist" game={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  )
}
