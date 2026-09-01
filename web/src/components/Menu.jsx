import { cloneElement, useEffect, useMemo, useRef } from 'react'
import { useWishlist } from '../lib/wishlist.js'
import { useMountTransition } from '../lib/useMountTransition.js'
import { lockScroll } from '../lib/scrollLock.js'
import { useAppBootstrap } from '../lib/appBootstrap.js'
import { useNavConfig, DEST_BY_KEY, GROUP_LABEL, isFolded, toggleGroup } from '../lib/navConfig.js'
import { DEST_ICONS } from './destIcons.jsx'
import LogoMark from './LogoMark.jsx'
import { useDialogA11y } from '../lib/useDialogA11y.js'

// The left drawer: a compact map of the app's places, grouped, with the bottom
// bar acting as a shortcut into the same destinations.
//
// It used to list a hand-written Lists section plus a "More" section holding
// whichever tabs the bar was hiding, which meant the drawer's shape depended on
// a setting made weeks ago and Insights only appeared if it had been switched
// off. Now every place in the compact nav catalog is here, in the user's order;
// filters stay inside Library and actions stay pinned below the map.
//
// There was an "on bar" pill on each row that is also a tab. It came off on
// 21 Aug: the bar it referred to is on screen at the same time as the drawer, so
// the pill labelled something the eye can already see on several rows.
// Which tabs are on the bar is a question the bar editor answers, and that is
// where the "on bar" / "off bar" column still lives.
//
// Group headings are printed as the list is walked, not by grouping it first,
// because the order belongs to the user: drag a row somewhere else and its
// heading follows it there. Same rule as the editor, so the two always agree.
export default function Menu({ open, onClose, onOpenWishlist, onOpenList, onOpenTab, onWarmTab, onOpenSettings, onSearch, searchPinned = false, activeTab }) {
  const { items: wishItems } = useWishlist(open)
  const { libraryCount } = useAppBootstrap(14, open)
  const nav = useNavConfig()
  const { mounted, closing } = useMountTransition(open)
  const dialogRef = useDialogA11y({ active: mounted, onClose })
  const pendingAction = useRef(null)

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

  const counts = useMemo(
    () => ({ library: libraryCount, wishlist: wishItems.length }),
    [libraryCount, wishItems],
  )

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    if (!mounted) return undefined
    return lockScroll()
  }, [mounted])

  // A destination used to mount in the same frame the drawer began closing.
  // Both full-screen surfaces then animated over each other for 220ms. Hold the
  // navigation until the shared drawer exit has fully unmounted instead.
  useEffect(() => {
    if (mounted || !pendingAction.current) return
    const action = pendingAction.current
    pendingAction.current = null
    action()
  }, [mounted])

  useEffect(() => {
    if (open) pendingAction.current = null
  }, [open])

  if (!mounted) return null

  const go = (fn) => {
    pendingAction.current = fn || null
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
      <div data-dialog-companion className={`drawer-scrim${closing ? ' closing' : ''}`} onClick={onClose} />
      <aside ref={dialogRef} className={`drawer${closing ? ' closing' : ''}`} role="dialog" aria-modal="true" aria-label="Menu">
        <div className="drawer-head">
          <div className="drawer-brand">
            <LogoMark className="drawer-logo-mark" />
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

        {/* Pinned actions stay visible regardless of drawer ordering or folds. */}
        <div className="menu-foot">
          <div className={`menu-foot-acts${searchPinned ? ' has-search' : ''}`}>
            {searchPinned ? (
              <button type="button" className="menu-fb" onClick={() => go(onSearch)}>
                {cloneElement(DEST_ICONS.search, { className: 'menu-fb-i' })}
                Search
              </button>
            ) : null}
            <button type="button" className="menu-fb" onClick={() => go(onOpenSettings)}>
              {cloneElement(DEST_ICONS.settings, { className: 'menu-fb-i' })}
              Settings
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
