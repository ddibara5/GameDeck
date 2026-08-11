import { useEffect, useMemo, useRef, useState } from 'react'
import Cover from './Cover.jsx'
import GameSheet from './GameSheet.jsx'
import { useWishlist, removeFromWishlist, restoreToWishlist, reconcileWishlist } from '../lib/wishlist.js'
import { loadLibraryTitles } from '../lib/discover.js'
import './wishlist.css'

const CURRENT_YEAR = new Date().getFullYear()
const SORT_KEY = 'gamedeck_wishlist_sort'
const SORTS = [
  { k: 'release', label: 'Release' },
  { k: 'added', label: 'Added' },
  { k: 'az', label: 'A-Z' },
]

function byTitle(a, b) {
  return (a.title || '').localeCompare(b.title || '')
}

// How far out an upcoming game is, honestly, from year alone (no month/day data).
function relLabel(year) {
  const d = year - CURRENT_YEAR
  if (d <= 0) return 'This year'
  if (d === 1) return 'Next year'
  return `in ${d} years`
}

// Group + order the wishlist for the chosen sort. "release" keeps smart sections
// (Coming soon / Out now / No date yet); the other sorts are one flat list.
function buildSections(items, sort) {
  if (sort === 'az') {
    return [{ key: 'az', rows: [...items].sort(byTitle) }]
  }
  if (sort === 'added') {
    return [
      {
        key: 'added',
        rows: [...items].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)),
      },
    ]
  }
  const up = []
  const out = []
  const none = []
  for (const r of items) {
    if (!r.year) none.push(r)
    else if (r.year >= CURRENT_YEAR) up.push(r)
    else out.push(r)
  }
  up.sort((a, b) => a.year - b.year || byTitle(a, b))
  out.sort((a, b) => b.year - a.year || byTitle(a, b))
  none.sort(byTitle)
  const sections = []
  if (up.length) sections.push({ key: 'up', label: 'Coming soon', amber: true, rows: up })
  if (out.length) sections.push({ key: 'out', label: 'Out now', rows: out })
  if (none.length) sections.push({ key: 'none', label: 'No date yet', rows: none })
  return sections
}

// One wishlist row with iOS-style swipe-left-to-delete. A short swipe snaps the
// red trash action open; a long swipe deletes outright. Tapping the face opens
// the sheet. Touch is handled with a non-passive listener so the row can own the
// horizontal gesture without fighting vertical page scroll.
function SwipeRow({ r, onOpen, onRemove }) {
  const rootRef = useRef(null)
  const faceRef = useRef(null)
  const g = useRef({ base: 0, pos: 0, sx: 0, sy: 0, axis: null, moved: false, suppress: false })
  const [revealed, setRevealed] = useState(false)
  const apiRef = useRef({})

  const REVEAL = 76
  const DELETE_AT = 150
  const MAX = 220

  const upcoming = r.year && r.year >= CURRENT_YEAR

  // Keep the imperative handlers pointing at fresh callbacks/state.
  apiRef.current.collapseAndRemove = () => {
    const root = rootRef.current
    const face = faceRef.current
    if (face) {
      face.style.transition = 'transform 0.18s ease'
      face.style.transform = 'translateX(-100%)'
    }
    if (root) {
      root.style.height = `${root.offsetHeight}px`
      void root.offsetHeight
      root.style.transition = 'height 0.22s ease, opacity 0.22s ease'
      root.style.height = '0px'
      root.style.opacity = '0'
    }
    setTimeout(() => onRemove(r), 200)
  }
  apiRef.current.close = () => {
    setPos(0, true)
    setRevealed(false)
  }

  function setPos(p, animate) {
    g.current.pos = p
    const face = faceRef.current
    if (!face) return
    face.style.transition = animate ? 'transform 0.22s cubic-bezier(0.22,1,0.36,1)' : 'none'
    face.style.transform = `translateX(${p}px)`
  }

  useEffect(() => {
    const face = faceRef.current
    if (!face) return
    const onStart = (e) => {
      const t = e.touches[0]
      g.current.base = g.current.pos
      g.current.sx = t.clientX
      g.current.sy = t.clientY
      g.current.axis = null
      g.current.moved = false
    }
    const onMove = (e) => {
      const s = g.current
      const t = e.touches[0]
      const mx = t.clientX - s.sx
      const my = t.clientY - s.sy
      if (s.axis == null) {
        if (Math.abs(mx) < 6 && Math.abs(my) < 6) return
        s.axis = Math.abs(mx) > Math.abs(my) * 1.2 ? 'h' : 'v'
      }
      if (s.axis !== 'h') return
      e.preventDefault()
      s.moved = true
      let next = s.base + mx
      if (next > 0) next = 0
      if (next < -MAX) next = -MAX
      setPos(next, false)
    }
    const onEnd = () => {
      const s = g.current
      if (s.axis !== 'h' || !s.moved) return
      s.suppress = true
      setTimeout(() => {
        g.current.suppress = false
      }, 350)
      if (s.pos <= -DELETE_AT) {
        apiRef.current.collapseAndRemove()
        return
      }
      if (s.pos <= -REVEAL / 2) {
        setPos(-REVEAL, true)
        setRevealed(true)
      } else {
        setPos(0, true)
        setRevealed(false)
      }
    }
    face.addEventListener('touchstart', onStart, { passive: true })
    face.addEventListener('touchmove', onMove, { passive: false })
    face.addEventListener('touchend', onEnd)
    face.addEventListener('touchcancel', onEnd)
    return () => {
      face.removeEventListener('touchstart', onStart)
      face.removeEventListener('touchmove', onMove)
      face.removeEventListener('touchend', onEnd)
      face.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  function onFaceClick() {
    if (g.current.suppress) return
    if (revealed) {
      apiRef.current.close()
      return
    }
    onOpen(r)
  }

  return (
    <div className={`wl-swipe${revealed ? ' revealed' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="wl-trash"
        aria-label={`Remove ${r.title}`}
        onClick={() => apiRef.current.collapseAndRemove()}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </button>
      <div
        className="wl-face"
        ref={faceRef}
        role="button"
        tabIndex={0}
        onClick={onFaceClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen(r)
          }
        }}
      >
        <Cover src={r.cover} title={r.title} size="sm" className="wish-cover" />
        <div className="wl-rb">
          <div className="wl-rt">{r.title}</div>
          <div className="wl-rm">
            <span>{r.year || 'TBA'}</span>
            {upcoming ? <span className="wl-soon">{relLabel(r.year)}</span> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function WishlistTab({ onClose }) {
  const { items, loading } = useWishlist()
  const [reconciled, setReconciled] = useState([])
  const [noteDismissed, setNoteDismissed] = useState(false)
  const [selected, setSelected] = useState(null)
  const [undo, setUndo] = useState(null)
  const undoTimer = useRef(null)
  const [sort, setSort] = useState(() => {
    try {
      return localStorage.getItem(SORT_KEY) || 'release'
    } catch {
      return 'release'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(SORT_KEY, sort)
    } catch {
      /* ignore */
    }
  }, [sort])

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

  useEffect(() => () => clearTimeout(undoTimer.current), [])

  const sections = useMemo(() => buildSections(items, sort), [items, sort])

  function handleRemove(row) {
    removeFromWishlist(row.igdb_id)
    setUndo(row)
    clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => setUndo(null), 4200)
  }

  function handleUndo() {
    if (undo) restoreToWishlist(undo)
    clearTimeout(undoTimer.current)
    setUndo(null)
  }

  const back = (
    <button type="button" className="wl-back" onClick={onClose} aria-label="Back">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  )

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

      {items.length > 1 ? (
        <div className="wl-sort" role="tablist" aria-label="Sort wishlist">
          {SORTS.map((s) => (
            <button
              key={s.k}
              type="button"
              role="tab"
              aria-selected={sort === s.k}
              className={`wl-sort-b${sort === s.k ? ' on' : ''}`}
              onClick={() => setSort(s.k)}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}

      {sections.map((sec) => (
        <div key={sec.key}>
          {sec.label ? <div className={`wl-group${sec.amber ? ' amber' : ''}`}>{sec.label}</div> : null}
          {sec.rows.map((r) => (
            <SwipeRow key={r.igdb_id} r={r} onOpen={setSelected} onRemove={handleRemove} />
          ))}
        </div>
      ))}

      {undo ? (
        <div className="wl-toast" role="status">
          <span className="wl-toast-t">Removed <b>{undo.title}</b></span>
          <button type="button" className="wl-toast-u" onClick={handleUndo}>Undo</button>
        </div>
      ) : null}

      {selected ? (
        <GameSheet variant="wishlist" game={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  )
}
