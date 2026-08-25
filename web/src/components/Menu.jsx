import { cloneElement, useEffect, useMemo } from 'react'
import { useWishlist } from '../lib/wishlist.js'
import { useMountTransition } from '../lib/useMountTransition.js'
import { lockScroll } from '../lib/scrollLock.js'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { useStatusMap, effectiveStatus, includeInLists } from '../lib/userStatus.js'
import { useNavConfig, DEST_BY_KEY, GROUP_LABEL, isFolded, toggleGroup } from '../lib/navConfig.js'
import { DEST_ICONS } from './destIcons.jsx'

// The left drawer: the whole map of the app, grouped, with the bottom bar marked
// as a shortcut into it rather than as a separate thing.
//
// It used to list a hand-written Lists section plus a "More" section holding
// whichever tabs the bar was hiding, which meant the drawer's shape depended on
// a setting made weeks ago and Insights only appeared if it had been switched
// off. Now every destination in the nav catalog is here, in the user's own order.
//
// There was an "on bar" pill on each row that is also a tab. It came off on
// 21 Aug: the bar it referred to is on screen at the same time as the drawer, so
// the pill labelled something the eye can already see, on five of twelve rows.
// Which tabs are on the bar is a question the bar editor answers, and that is
// where the "on bar" / "off bar" column still lives.
//
// Group headings are printed as the list is walked, not by grouping it first,
// because the order belongs to the user: drag a row somewhere else and its
// heading follows it there. Same rule as the editor, so the two always agree.
export default function Menu({ open, onClose, onOpenWishlist, onOpenList, onOpenTab, onWarmTab, onOpenSettings, onShuffle, onCustomize, activeTab }) {
  const { items: wishItems } = useWishlist()
  const { games } = useLibraryGames()
  const statusMap = useStatusMap()
  const nav = useNavConfig()
  const { mounted, closing } = useMountTransition(open)

  // How many rows each group holds, over the user's own order. A group split in
  // two by dragging counts as one, which is also how it folds: the fold is a
  // property of the GROUP, not of a run of adjacent rows.
  const groupSize = useMemo(() => {
    const c = {}
    for (const key of nav.order) {
      const dest = DEST_BY_KEY[key]
      if (dest) c[dest.group] = (c[dest.group] || 0) + 1
    }
    return c
  }, [nav.order])

  // Live counts from the (session-cached) library and the status map, so a badge
  // and the list it opens can never disagree.
  const counts = useMemo(() => {
    const c = { backlog: 0, playing: 0, finished: 0 }
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
    // Two actions in the catalog now, so the row says which one rather than
    // `action` meaning Settings by position.
    if (dest.kind === 'action') return go(dest.action === 'shuffle' ? onShuffle : onOpenSettings)
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
            const folded = isFolded(nav, dest.group)
            const count = counts[key]
            // Through the helper rather than reading `enabled` directly, so the
            // pill goes quiet when the bar is switched off instead of pointing
            // at a strip that is not on screen.
            const here = dest.kind === 'tab' && key === activeTab
            return (
              <div key={key}>
                {/* The heading is the control. Folding is stored per group in
                    gamedeck_nav_v2, so it survives closing the drawer, and the
                    count only appears while folded: open, the rows say it. */}
                {heading ? (
                  <button
                    type="button"
                    className={`menu-sec-label menu-sec${folded ? ' folded' : ''}`}
                    aria-expanded={!folded}
                    onClick={() => toggleGroup(nav, dest.group)}
                  >
                    <span className="menu-sec-t">{heading}</span>
                    {folded ? <span className="menu-sec-n">{groupSize[dest.group]}</span> : null}
                    <svg className="menu-sec-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                ) : null}
                {folded ? null : (
                <button
                  type="button"
                  className={`menu-item${here ? ' here' : ''}`}
                  onPointerDown={() => dest.kind === 'tab' && onWarmTab && onWarmTab(dest.key)}
                  onFocus={() => dest.kind === 'tab' && onWarmTab && onWarmTab(dest.key)}
                  onClick={() => activate(dest)}
                >
                  {cloneElement(DEST_ICONS[key] || DEST_ICONS.home, { className: 'menu-icon' })}
                  <span className="menu-label">{dest.label}</span>
                  {count != null ? (
                    <span className={`menu-value${key === 'wishlist' ? ' accent' : ''}`}>{count}</span>
                  ) : null}
                </button>
                )}
              </div>
            )
          })}

        </div>

        {/* Pinned, outside the scrolling body. Both of these used to sit at the
            end of the list, which on a drawer that overflows by 113px meant the
            two things you reach for deliberately were the two you had to scroll
            to find. Neither is a destination in the list sense, so neither is
            reorderable and neither belongs in the catalog. */}
        <div className="menu-foot">
          <div className="menu-foot-acts">
            <button type="button" className="menu-fb" onClick={() => go(onOpenSettings)}>
              {cloneElement(DEST_ICONS.settings, { className: 'menu-fb-i' })}
              Settings
            </button>
            <button type="button" className="menu-fb" onClick={() => go(onCustomize)}>
              <svg className="menu-fb-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h10M18 7h2M4 17h6M14 17h6" />
                <circle cx="16" cy="7" r="2" />
                <circle cx="12" cy="17" r="2" />
              </svg>
              Customize
            </button>
          </div>
          <div className="menu-foot-n">GameDeck · {counts.library} games</div>
        </div>
      </aside>
    </>
  )
}
