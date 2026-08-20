import { cloneElement, useEffect, useMemo } from 'react'
import { useWishlist } from '../lib/wishlist.js'
import { useMountTransition } from '../lib/useMountTransition.js'
import { lockScroll } from '../lib/scrollLock.js'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { useStatusMap, effectiveStatus, includeInLists } from '../lib/userStatus.js'
import { useNavConfig, DEST_BY_KEY, GROUP_LABEL } from '../lib/navConfig.js'
import { DEST_ICONS } from './destIcons.jsx'

// The left drawer: the whole map of the app, grouped, with the bottom bar marked
// as a shortcut into it rather than as a separate thing.
//
// It used to list a hand-written Lists section plus a "More" section holding
// whichever tabs the bar was hiding, which meant the drawer's shape depended on
// a setting made weeks ago and Insights only appeared if it had been switched
// off. Now every destination in the nav catalog is here, in the user's own order,
// and an "on bar" pill says which ones are also a tab.
//
// Group headings are printed as the list is walked, not by grouping it first,
// because the order belongs to the user: drag a row somewhere else and its
// heading follows it there. Same rule as the editor, so the two always agree.
export default function Menu({ open, onClose, onOpenWishlist, onOpenList, onOpenTab, onOpenSettings, onCustomize, activeTab }) {
  const { items: wishItems } = useWishlist()
  const { games } = useLibraryGames()
  const statusMap = useStatusMap()
  const nav = useNavConfig()
  const { mounted, closing } = useMountTransition(open)

  // Live counts from the (session-cached) library and the status map, so a badge
  // and the list it opens can never disagree.
  const counts = useMemo(() => {
    const c = { backlog: 0, playing: 0, finished: 0, abandoned: 0 }
    for (const g of games) {
      if (!includeInLists(g, statusMap)) continue
      const s = effectiveStatus(g, statusMap)
      if (c[s] != null) c[s] += 1
    }
    return { ...c, library: games.length, wishlist: wishItems.length }
  }, [games, statusMap, wishItems])

  // Close on Escape.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    if (!mounted) return undefined
    return lockScroll()
  }, [mounted])

  if (!mounted) return null

  const go = (fn) => {
    if (fn) fn()
    onClose()
  }

  const activate = (dest) => {
    if (dest.kind === 'tab') return go(() => onOpenTab && onOpenTab(dest.key))
    if (dest.kind === 'view') return go(onOpenWishlist)
    if (dest.kind === 'list') return go(() => onOpenList && onOpenList(dest.viewKey))
    if (dest.kind === 'action') return go(onOpenSettings)
    return undefined
  }

  let lastGroup = null

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

        <div className="drawer-body">
          {nav.order.map((key) => {
            const dest = DEST_BY_KEY[key]
            if (!dest) return null
            const heading = dest.group !== lastGroup ? GROUP_LABEL[dest.group] : null
            lastGroup = dest.group
            const count = counts[key]
            const onBar = dest.kind === 'tab' && Boolean(nav.enabled[key])
            const here = dest.kind === 'tab' && key === activeTab
            return (
              <div key={key}>
                {heading ? <div className="menu-sec-label">{heading}</div> : null}
                <button type="button" className={`menu-item${here ? ' here' : ''}`} onClick={() => activate(dest)}>
                  {cloneElement(DEST_ICONS[key] || DEST_ICONS.home, { className: 'menu-icon' })}
                  <span className="menu-label">{dest.label}</span>
                  {count != null ? (
                    <span className={`menu-value${key === 'wishlist' ? ' accent' : ''}`}>{count}</span>
                  ) : null}
                  {onBar ? <span className="menu-bar-tag">on bar</span> : null}
                </button>
              </div>
            )
          })}

          <button type="button" className="drawer-cz" onClick={() => go(onCustomize)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h10M18 7h2M4 17h6M14 17h6" />
              <circle cx="16" cy="7" r="2" />
              <circle cx="12" cy="17" r="2" />
            </svg>
            Customize drawer
          </button>
        </div>

        <div className="menu-foot">GameDeck · {counts.library} games</div>
      </aside>
    </>
  )
}
