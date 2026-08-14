import { useMemo } from 'react'
import Cover from './Cover.jsx'
import { relOf, effTs, isOut, shortOf, DAY } from '../lib/wishlistRelease.js'

// The nearest concrete upcoming releases, as countdown cards.
//
// Shared by the Wishlist tab and the Discover "Your wishlist" page. The two feed
// it differently shaped rows - the wishlist table uses igdb_id/title, the Discover
// cards use id/name - so both spellings are read here rather than making either
// caller reshape its data on the way in.
//
// Styles live in index.css, not wishlist.css: two lazily loaded chunks render this
// now, and a Discover visitor who had never opened the Wishlist tab would get an
// unstyled strip. Same reason the filter-sheet primitives sit there.
export default function NextUp({ items, onOpen }) {
  const soon = useMemo(
    () =>
      items
        .map((r) => ({ r, rel: relOf(r) }))
        // Concrete dates only. A "sometime in 2027" entry has no countdown worth
        // showing, and would sit in the strip claiming a precision it does not have.
        .filter(({ rel }) => (rel.k === 'day' || rel.k === 'month') && rel.ts != null && !isOut(rel))
        .sort((a, b) => effTs(a.rel) - effTs(b.rel))
        .slice(0, 6),
    [items]
  )
  // One card is not a strip, it is the same information the first section already
  // carries, so the whole block stays hidden until there are at least two.
  if (soon.length < 2) return null
  return (
    <div className="wl-next-wrap">
      <div className="wl-next-lbl">Next up</div>
      <div className="wl-next">
        {soon.map(({ r, rel }) => {
          const days = Math.round((effTs(rel) - Date.now()) / DAY)
          const near = rel.k === 'day' && days <= 45
          const big = near ? String(Math.max(days, 0)) : shortOf(rel)
          const lab = near ? (days === 1 ? 'day away' : 'days away') : ''
          const title = r.title || r.name
          return (
            <button type="button" key={r.igdb_id ?? r.id} className="wl-ncard" onClick={() => onOpen(r)}>
              <div className="wl-nart">
                <Cover src={r.cover} title={title} size="sm" className="wl-ncover" />
                <div className="wl-nover">
                  <div className="wl-nbig">{big}</div>
                  <div className="wl-nlab">{lab || ' '}</div>
                </div>
              </div>
              <div className="wl-nt">{title}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
