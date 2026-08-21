import { useEffect, useMemo, useRef, useState } from 'react'
import Cover from './Cover.jsx'
import GameSheet from './GameSheet.jsx'
import { useWishlist, removeFromWishlist, restoreToWishlist, reconcileWishlist } from '../lib/wishlist.js'
import { loadLibraryTitles } from '../lib/discover.js'
import NextUp from './NextUp.jsx'
import { relOf, effTs, isOut, byTitle, groupByRelease, shortOf, MON, DAY } from '../lib/wishlistRelease.js'
import './wishlist.css'

const SORT_KEY = 'gamedeck_wishlist_sort'
const DENSITY_KEY = 'gamedeck_wishlist_density'
const SORTS = [
  { k: 'release', label: 'Release' },
  { k: 'added', label: 'Added' },
  { k: 'az', label: 'A-Z' },
]


function fmtDay(ts) {
  const d = new Date(ts)
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}
function fmtQuarter(ts) {
  const d = new Date(ts)
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`
}

// Full chip for list rows: proximity-colored countdown / date / status.
function chipOf(rel) {
  if (rel.k === 'tba') return { cls: 'tba', txt: rel.label || 'TBA' }
  if (isOut(rel)) return { cls: 'out', txt: 'Out now' }
  const days = Math.round((effTs(rel) - Date.now()) / DAY)
  if (rel.k === 'day') {
    if (days <= 0) return { cls: 'soon', txt: 'Out today' }
    if (days <= 30) return { cls: 'soon', txt: `in ${days} day${days === 1 ? '' : 's'}` }
    return { cls: days <= 120 ? 'near' : 'far', txt: rel.label || fmtDay(rel.ts) }
  }
  if (rel.k === 'month') return { cls: days <= 120 ? 'near' : 'far', txt: rel.label || `${MON[new Date(rel.ts).getUTCMonth()]} ${new Date(rel.ts).getUTCFullYear()}` }
  if (rel.k === 'quarter') return { cls: 'far', txt: rel.label || fmtQuarter(rel.ts) }
  return { cls: 'far', txt: rel.label || String(new Date(rel.ts).getUTCFullYear()) }
}

// Group + order the wishlist. "release" builds smart date sections; the other sorts
// are one flat list.
function buildSections(items, sort) {
  if (sort === 'az') return [{ id: 'az', rows: [...items].sort(byTitle) }]
  if (sort === 'added') {
    return [{ id: 'added', rows: [...items].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)) }]
  }
  return groupByRelease(items)
}

function Chip({ rel }) {
  const c = chipOf(rel)
  return <span className={`wl-chip ${c.cls}`}>{c.txt}</span>
}

// One wishlist row with iOS-style swipe-left-to-delete. Short swipe reveals the trash
// action; long swipe deletes outright. Tapping opens the sheet.
function SwipeRow({ r, onOpen, onRemove }) {
  const rootRef = useRef(null)
  const faceRef = useRef(null)
  const g = useRef({ base: 0, pos: 0, sx: 0, sy: 0, axis: null, moved: false, suppress: false })
  const [revealed, setRevealed] = useState(false)
  const apiRef = useRef({})

  const REVEAL = 76
  const DELETE_AT = 150
  const MAX = 220

  const rel = relOf(r)
  const chip = chipOf(rel)
  const sub = rel.label && rel.label !== chip.txt ? rel.label : ''

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
          {sub ? <div className="wl-rm">{sub}</div> : null}
        </div>
        <Chip rel={rel} />
      </div>
    </div>
  )
}

function GridCard({ r, onOpen }) {
  const rel = relOf(r)
  const short = shortOf(rel)
  const cls = chipOf(rel).cls
  return (
    <button type="button" className="wl-gc" onClick={() => onOpen(r)}>
      <div className="wl-gcov">
        <Cover src={r.cover} title={r.title} size="lg" className="wl-gcover" />
        <span className={`wl-gbadge ${cls}`}>{short}</span>
      </div>
      <div className="wl-gt">{r.title}</div>
    </button>
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
  const [density, setDensity] = useState(() => {
    try {
      return localStorage.getItem(DENSITY_KEY) || 'list'
    } catch {
      return 'list'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(SORT_KEY, sort)
    } catch {
      /* ignore */
    }
  }, [sort])

  useEffect(() => {
    try {
      localStorage.setItem(DENSITY_KEY, density)
    } catch {
      /* ignore */
    }
  }, [density])

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

  const isGrid = density === 'grid'

  return (
    <div className="wl-page">
      <div className="wl-head">
        {back}
        <div>
          {/* See ListView: this is the screen's only heading while it is up. */}
          <h1 className="wl-title">Wishlist</h1>
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
        <div className="wl-controls">
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
          <div className="wl-dens" role="group" aria-label="Density">
            <button type="button" className={`wl-dbtn${!isGrid ? ' on' : ''}`} aria-label="List view" aria-pressed={!isGrid} onClick={() => setDensity('list')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
            </button>
            <button type="button" className={`wl-dbtn${isGrid ? ' on' : ''}`} aria-label="Grid view" aria-pressed={isGrid} onClick={() => setDensity('grid')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
            </button>
          </div>
        </div>
      ) : null}

      {sort === 'release' && !loading ? <NextUp items={items} onOpen={setSelected} /> : null}

      {sections.map((sec) => (
        <div key={sec.id}>
          {sec.label ? (
            <div className={`wl-sech${sec.amber ? ' amber' : ''}`}>
              <span className="wl-sech-l">{sec.label}</span>
              <span className="wl-sech-c">{sec.rows.length}</span>
            </div>
          ) : null}
          {isGrid ? (
            <div className="wl-grid">
              {sec.rows.map((r) => (
                <GridCard key={r.igdb_id} r={r} onOpen={setSelected} />
              ))}
            </div>
          ) : (
            sec.rows.map((r) => (
              <SwipeRow key={r.igdb_id} r={r} onOpen={setSelected} onRemove={handleRemove} />
            ))
          )}
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
