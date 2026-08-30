import { useEffect } from 'react'

// Count of full-screen, back-navigable overlays currently mounted OUTSIDE the App
// shell (e.g. the Discover "see all" rail page, which is portaled to <body> and
// whose open state App can't see). App's drawer edge-swipe consults overlaysOpen()
// so an edge swipe on top of such an overlay backs OUT of the overlay instead of
// opening the app drawer behind it.
let openCount = 0

export function overlaysOpen() {
  return openCount > 0
}

/**
 * iOS-style edge-back gesture. Start a touch within EDGE_PX of the left screen
 * edge and drag right past BACK_DX to fire `onBack` (typically the overlay's
 * close). Mirrors the built-in Settings / Customize pages so every full-screen
 * overlay dismisses the same way.
 *
 * Options:
 *   disabled - suppress the gesture while a competing interaction is live (a
 *              drag-reorder, an open nested sheet), so the swipe doesn't back
 *              out from under it.
 *   register - count this overlay in overlaysOpen() (default true). Only
 *              overlays rendered outside the App shell need it; leave it on
 *              unless App already tracks the overlay's open state.
 *
 *              PASS A FLAG, NOT `true`, IF THE CALLER STAYS MOUNTED WHILE
 *              CLOSED. The count follows this effect, so a component that its
 *              parent renders unconditionally and that merely returns null when
 *              closed will hold the count above zero for the whole session and
 *              suppress the drawer swipe app-wide. `disabled` does not cover
 *              this: it suppresses the gesture, not the registration, and the
 *              two are deliberately separate (a drag-reorder disables the
 *              gesture while the overlay is very much still up).
 */
export function useEdgeBack(onBack, { disabled = false, register = true } = {}) {
  // Registered while `register` is true, so App can suppress its own edge-swipe
  // while this overlay is up.
  useEffect(() => {
    if (!register) return undefined
    openCount += 1
    return () => {
      openCount -= 1
    }
  }, [register])

  useEffect(() => {
    const EDGE_PX = 24
    const BACK_DX = 60
    let startX = 0
    let startY = 0
    let tracking = false
    let fromEdge = false

    const onStart = (e) => {
      const t = e.touches && e.touches[0]
      if (!t) return
      startX = t.clientX
      startY = t.clientY
      fromEdge = startX <= EDGE_PX
      tracking = true
    }
    const onMove = (e) => {
      if (!tracking) return
      const t = e.touches && e.touches[0]
      if (!t) return
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      // Only act on a clearly horizontal gesture, so vertical scrolling is untouched.
      if (Math.abs(dx) <= Math.abs(dy)) return
      // Own the edge gesture once its horizontal intent is clear. Otherwise the
      // browser can navigate history while the overlay also closes itself. A
      // disabled nested interaction still claims the gesture; it suppresses
      // Back rather than handing the same swipe to browser history underneath.
      if (fromEdge && dx > 0 && e.cancelable) e.preventDefault()
      if (disabled) return
      if (fromEdge && dx > BACK_DX) {
        onBack()
        tracking = false
      }
    }
    const onEnd = () => {
      tracking = false
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [disabled, onBack])
}
