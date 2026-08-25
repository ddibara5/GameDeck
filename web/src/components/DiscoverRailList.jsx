import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Cover from './Cover.jsx'
import WishHeart from './WishHeart.jsx'
import Skeleton from './Skeleton.jsx'
import DiscoverDetail from './DiscoverDetail.jsx'
import TimingOverlay from './TimingOverlay.jsx'
import { fetchDiscover } from '../lib/discover.js'
import { releaseTiming, timingParts, shelfMetaDate } from '../lib/format.js'
import { groupByRelease } from '../lib/wishlistRelease.js'
import { useDelayedClose } from '../lib/useDelayedClose.js'
import { useEdgeBack } from '../lib/useEdgeBack.js'
import { lockScroll } from '../lib/scrollLock.js'
import { gameSheetWarmProps } from '../lib/gameSheetWarmIntent.js'

// Full "see all" page for a Discover rail: every game in the list, in a grid,
// with a sort control and paging. Opened by tapping a rail heading. Portaled to
// <body> so its fixed overlay anchors to the viewport (same as the game sheet),
// never to a transformed ancestor.
const PAGE = 30

// Wishlist pages get the same date sections as the Wishlist tab, from the same
// grouping function. A wishlist is read as a release calendar - "what is coming,
// and when" - and a flat grid of 30 answers neither. Only for the wishlist kinds:
// an IGDB discovery rail is a ranked list, and chopping it into months would
// destroy the ranking that IS the list.
const isWishKind = (kind) => kind === 'wishlist' || kind === 'wishlistSoon' || kind === 'wishlistOutNow'
// ...and only while the order is still release-shaped. Under "Name A-Z" or
// "Highest rated" the rows no longer run in date order, so month headings would
// be labelling arbitrary slices.
const SECTIONED_SORTS = new Set(['', 'release'])

// Sort options. '' = the rail's own recommended order (server default). The rest
// map to the API's shared SORTS; the API applies them within the rail's own set.
const SORTS = [
  { key: '', label: 'Recommended' },
  { key: 'popularity', label: 'Most popular' },
  { key: 'rating', label: 'Highest rated' },
  { key: 'release', label: 'Newest' },
  { key: 'name', label: 'Name A-Z' },
]

// Client-side sort for the local-data lists (Game Pass, wishlist rows) that don't
// go through the IGDB proxy. '' / popularity keep the list's incoming order.
function sortLocal(items, key) {
  const a = [...(items || [])]
  if (key === 'rating') a.sort((x, y) => (Number(y.rating) || 0) - (Number(x.rating) || 0))
  else if (key === 'release')
    a.sort((x, y) => (Number(y.released) || 0) - (Number(x.released) || 0) || (Number(y.year) || 0) - (Number(x.year) || 0))
  else if (key === 'name') a.sort((x, y) => String(x.name || '').localeCompare(String(y.name || '')))
  return a
}

function RailCard({ g, isOwned, wishIds, onOpen }) {
  const timing = releaseTiming(g.released)
  const parts = timingParts(g.released)
  // Only set when the line would otherwise be blank.
  const metaDate = shelfMetaDate(g, timing)
  return (
    <div className="shelf-card-wrap">
      <button type="button" className="shelf-card" onClick={() => onOpen(g)} {...gameSheetWarmProps(g, 'discover')}>
        <div className="shelf-poster">
          <Cover src={g.cover} title={g.name} size="lg" />
          {isOwned(g.name) ? <span className="in-library-dot" title="In library" /> : null}
          <TimingOverlay parts={parts} />
        </div>
        <div className="shelf-card-title">{g.name}</div>
        <div className="shelf-card-meta">
          {g.rating ? <span>{'★'} {g.rating}</span> : null}
          {metaDate ? <span className="sc-date">{metaDate}</span> : null}
        </div>
      </button>
      <WishHeart game={g} active={wishIds.has(g.id)} />
    </div>
  )
}

export default function DiscoverRailList({ row, seedItems, isOwned, hideOwned, wishIds, onClose, onAsk, onMoreLikeThis, filters }) {
  const { closing, requestClose } = useDelayedClose(onClose)
  const isRail = row.kind === 'rail'

  const [sort, setSort] = useState('')
  const [sortOpen, setSortOpen] = useState(false)
  const [selected, setSelected] = useState(null)

  // Server (IGDB rail) state.
  const [rows, setRows] = useState([])
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(isRail)
  const [hasMore, setHasMore] = useState(false)
  const reqRef = useRef(0)

  // Local (Game Pass / wishlist) paging.
  const [localCount, setLocalCount] = useState(PAGE)

  // Lock the background while the page is open (shared ref-counted lock).
  useEffect(() => lockScroll(), [])

  // Edge-swipe from the left to back out (same gesture as Settings / Customize).
  // Suppressed while a nested sheet is up so the swipe closes that first.
  useEdgeBack(requestClose, { disabled: sortOpen || Boolean(selected) })

  // Stable identity for the inherited top-bar filters, so the effect below reruns
  // if they ever change while this page is open rather than silently serving the
  // set it was opened with.
  const filterSig = JSON.stringify(filters || null)

  // Rail kinds: (re)fetch page 0 whenever the sort or the filters change.
  useEffect(() => {
    if (!isRail) return undefined
    let alive = true
    const reqId = ++reqRef.current
    setLoading(true)
    fetchDiscover({ ...(filters || {}), rail: row.key, sort: sort || (filters && filters.sort) || undefined, page: 0, limit: PAGE })
      .then((games) => {
        if (!alive || reqId !== reqRef.current) return
        setRows(games)
        setPage(0)
        setHasMore(games.length >= PAGE)
        setLoading(false)
      })
      .catch(() => {
        if (alive && reqId === reqRef.current) {
          setRows([])
          setLoading(false)
        }
      })
    return () => {
      alive = false
    }
  }, [isRail, row.key, sort, filterSig])

  async function showMoreRail() {
    const reqId = ++reqRef.current
    const next = page + 1
    setLoading(true)
    try {
      const games = await fetchDiscover({ ...(filters || {}), rail: row.key, sort: sort || (filters && filters.sort) || undefined, page: next, limit: PAGE })
      if (reqId !== reqRef.current) return
      setRows((prev) => [...prev, ...games])
      setPage(next)
      setHasMore(games.length >= PAGE)
    } catch {
      /* keep what we have */
    } finally {
      if (reqId === reqRef.current) setLoading(false)
    }
  }

  const localSorted = useMemo(() => (isRail ? [] : sortLocal(seedItems, sort)), [isRail, seedItems, sort])
  // The hide-in-library toggle has to be applied HERE too, not just on the home.
  // Local rows (wishlist, Game Pass) arrive pre-filtered through seedItems, but an
  // IGDB rail is fetched fresh by this component, so with the toggle on the shelf
  // dropped owned games and the page you opened from it put them straight back.
  const visibleRows = useMemo(
    () => (hideOwned ? rows.filter((g) => !isOwned(g.name)) : rows),
    [hideOwned, rows, isOwned]
  )
  const items = isRail ? visibleRows : localSorted.slice(0, localCount)
  const moreAvailable = isRail ? hasMore : localCount < localSorted.length

  // Sections are built from the VISIBLE page, not the whole list, so "Show more"
  // grows the sections you can already see rather than silently rewriting them.
  const sections = useMemo(() => {
    if (!isWishKind(row.kind) || !SECTIONED_SORTS.has(sort)) return null
    const secs = groupByRelease(items)
    // One section is not a grouping, it is a redundant heading. The out-now rail
    // collapses to exactly that, since every row in it has already shipped.
    return secs.length > 1 ? secs : null
  }, [row.kind, sort, items])

  const count = isRail ? `${items.length}${hasMore ? '+' : ''} games` : `${localSorted.length} games`
  const sub = row.sub ? `${count}  ·  ${row.sub}` : count
  const sortLabel = (SORTS.find((s) => s.key === sort) || SORTS[0]).label

  return createPortal(
    <div className={`rail-page${closing ? ' closing' : ''}`}>
      <div className="rail-head">
        <button type="button" className="rail-back" onClick={requestClose} aria-label="Back">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="rail-titles">
          <div className="rail-title">{row.label}</div>
          <div className="rail-sub">{sub}</div>
        </div>
        <button type="button" className="rail-sort" onClick={() => setSortOpen(true)} aria-label="Sort">
          {sortLabel}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      <div className="rail-scroll">
        {loading && items.length === 0 ? (
          <div style={{ padding: '10px 16px' }}>
            <Skeleton count={6} />
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">Nothing here yet</div>
            <div>This list has no games right now. Try another.</div>
          </div>
        ) : (
          <>
            {sections ? (
              sections.map((sec) => (
                <section key={sec.id}>
                  <div className={`rail-sech${sec.amber ? ' amber' : ''}`}>
                    <span className="rail-sech-l">{sec.label}</span>
                    <span className="rail-sech-c">{sec.rows.length}</span>
                  </div>
                  <div className="rail-grid">
                    {sec.rows.map((g) => (
                      <RailCard key={g.id} g={g} isOwned={isOwned} wishIds={wishIds} onOpen={setSelected} />
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <div className="rail-grid">
                {items.map((g) => (
                  <RailCard key={g.id} g={g} isOwned={isOwned} wishIds={wishIds} onOpen={setSelected} />
                ))}
              </div>
            )}
            {moreAvailable ? (
              <div className="show-more-row">
                <button
                  type="button"
                  className="show-more-btn"
                  disabled={loading}
                  onClick={() => (isRail ? showMoreRail() : setLocalCount((c) => c + PAGE))}
                >
                  {loading ? 'Loading…' : 'Show more'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {sortOpen ? (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setSortOpen(false)}>
          <div className="modal-sheet filter-sheet" role="dialog" aria-modal="true" aria-label="Sort">
            <div className="modal-handle" />
            <div className="detail-title">Sort</div>
            <div className="filter-group">
              <div className="filter-options">
                {SORTS.map((o) => (
                  <button
                    key={o.key || 'default'}
                    type="button"
                    className={`filter-opt${sort === o.key ? ' active' : ''}`}
                    onClick={() => {
                      setSort(o.key)
                      setLocalCount(PAGE)
                      setSortOpen(false)
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {selected ? (
        <DiscoverDetail
          game={selected}
          inLibrary={isOwned(selected.name)}
          onAsk={(g) => {
            setSelected(null)
            requestClose()
            onAsk && onAsk(g)
          }}
          onMoreLikeThis={(g) => {
            setSelected(null)
            requestClose()
            onMoreLikeThis && onMoreLikeThis(g)
          }}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>,
    document.body,
  )
}
