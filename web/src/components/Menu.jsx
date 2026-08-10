import { useEffect, useMemo } from 'react'
import { useWishlist } from '../lib/wishlist.js'
import { useMountTransition } from '../lib/useMountTransition.js'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { useStatusMap, effectiveStatus, includeInLists } from '../lib/userStatus.js'
import { MenuItem, ICONS } from './menuUI.jsx'

// Left drawer: a lists / content hub. App-wide settings live in the gear-opened
// Settings page (see SettingsPage.jsx); this panel stays focused on collections.
export default function Menu({ open, onClose, onOpenWishlist, onOpenList }) {
  const { items: wishItems } = useWishlist()
  const { games } = useLibraryGames()
  const statusMap = useStatusMap()
  const { mounted, closing } = useMountTransition(open)

  // Live counts for each status list, from the (session-cached) library + the
  // status map, so the badges match what the lists actually show.
  const counts = useMemo(() => {
    const c = { playing: 0, finished: 0, abandoned: 0 }
    for (const g of games) {
      if (!includeInLists(g, statusMap)) continue
      const s = effectiveStatus(g, statusMap)
      if (c[s] != null) c[s] += 1
    }
    return c
  }, [games, statusMap])

  const openList = (key) => {
    onOpenList(key)
    onClose()
  }

  // Close on Escape.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Lock background scroll while the drawer is open, so the page behind the
  // scrim can't scroll.
  useEffect(() => {
    if (!mounted) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mounted])

  if (!mounted) return null

  return (
    <>
      <div className={`drawer-scrim${closing ? ' closing' : ''}`} onClick={onClose} />
      <aside className={`drawer${closing ? ' closing' : ''}`} role="dialog" aria-label="Menu">
        <div className="drawer-head">
          <div className="drawer-brand">
            <svg className="gd-logo" style={{ width: 34, height: 36, flex: 'none' }} viewBox="130 105 252 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <polygon className="l2" points="138,306 256,365 256,399 138,340" fill="#792d08" />
              <polygon className="l1" points="374,306 256,365 256,399 374,340" fill="#5c2206" />
              <polygon className="l3" points="256,247 374,306 256,365 138,306" fill="#9a3b0c" />
              <polygon className="l3" points="138,239 256,298 256,332 138,273" fill="#9a3b0c" />
              <polygon className="l2" points="374,239 256,298 256,332 374,273" fill="#792d08" />
              <polygon className="l5" points="256,180 374,239 256,298 138,239" fill="#c85c15" />
              <polygon className="l6" points="138,172 256,231 256,265 138,206" fill="#d97716" />
              <polygon className="l4" points="374,172 256,231 256,265 374,206" fill="#b4590f" />
              <polygon className="l7" points="256,113 374,172 256,231 138,172" fill="#f5a623" />
            </svg>
            <span className="brand-word">Game<b>Deck</b></span>
          </div>
        </div>

        <div className="menu-sec">
          <div className="menu-sec-label">Lists</div>
          <MenuItem
            glyph={ICONS.heart}
            label="Wishlist"
            value={String(wishItems.length)}
            valueAccent
            onClick={() => {
              if (onOpenWishlist) onOpenWishlist()
              onClose()
            }}
          />
          <MenuItem glyph={ICONS.play} label="Playing" value={String(counts.playing)} onClick={() => openList('status:playing')} />
          <MenuItem glyph={ICONS.check} label="Finished" value={String(counts.finished)} onClick={() => openList('status:finished')} />
          <MenuItem glyph={ICONS.xcircle} label="Abandoned" value={String(counts.abandoned)} onClick={() => openList('status:abandoned')} />
        </div>

        <div className="menu-foot">GameDeck</div>
      </aside>
    </>
  )
}
