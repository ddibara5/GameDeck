import { useEffect, useRef } from 'react'

// Count of full-screen, back-navigable overlays currently mounted OUTSIDE the App
// shell (e.g. the Discover "see all" rail page, which is portaled to <body> and
// whose open state App can't see). App's drawer edge-swipe consults overlaysOpen()
// so an edge swipe on top of such an overlay backs OUT of the overlay instead of
// opening the app drawer behind it.
let openCount = 0

// Registration stack, oldest first. An edge swipe belongs to the most recently
// registered overlay only: when a sheet opens on top of a full-screen game page
// (rank sheet, lightbox, search), the page underneath must not also fire its
// back action from the same finger movement.
let seq = 0
const stack = []

export function overlaysOpen() {
  return openCount > 0
}

export function registerEdgeBack() {
  openCount += 1
  const id = ++seq
  stack.push(id)
  return id
}

export function unregisterEdgeBack(id) {
  const i = stack.lastIndexOf(id)
  if (i < 0) return
  openCount -= 1
  stack.splice(i, 1)
}

export function isEdgeBackTopmost(id) {
  return stack.length === 0 || stack[stack.length - 1] === id
}

// Gesture thresholds, shared with App's own edge-swipe handler.
export const EDGE_BACK_PX = 24
export const EDGE_BACK_DX = 60

/**
 * Pure classifier for one touchmove sample, so the trigger rule is unit-testable
 * without a DOM. Returns:
 *   'back'  - a completed edge-back swipe: fire the back action.
 *   'claim' - horizontal edge gesture below the back threshold: claim it (call
 *             preventDefault) so the browser doesn't also run history nav, but
 *             don't fire yet.
 *   'none'  - not an edge-back gesture (wrong edge, wrong direction, or the
 *             finger is mostly scrolling vertically).
 */
export function classifyEdgeSwipe({ startX, dx, dy, edgePx = EDGE_BACK_PX, backDx = EDGE_BACK_DX }) {
  const fromEdge = startX <= edgePx
  if (!fromEdge || dx <= 0) return 'none'
  // Only act on a clearly horizontal gesture, so vertical scrolling is untouched.
  if (Math.abs(dx) <= Math.abs(dy)) return 'none'
  return dx > backDx ? 'back' : 'claim'
}

/**
 * iOS-style edge-back gesture. Start a touch within EDGE_BACK_PX of the left
 * screen edge and drag right past EDGE_BACK_DX to fire `onBack` (typically the
 * overlay's close). Mirrors the built-in Settings / Customize pages so every
 * full-screen overlay dismisses the same way.
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
 *              suppress the edge-back swipe app-wide. `disabled` does not cover
 *              this: it suppresses the gesture, not the registration, and the
 *              two are deliberately separate (a drag-reorder disables the
 *              gesture while the overlay is very much still up).
 *
 * When several overlays are registered at once (a rank sheet over a game page),
 * only the topmost one fires: the gesture belongs to the newest registration.
 */
export function useEdgeBack(onBack, { disabled = false, register = true } = {}) {
  const idRef = useRef(0)
  // Registered while `register` is true, so App can suppress its own edge-swipe
  // while this overlay is up.
  useEffect(() => {
    if (!register) return undefined
    idRef.current = registerEdgeBack()
    const id = idRef.current
    return () => {
      unregisterEdgeBack(id)
    }
  }, [register])

  useEffect(() => {
    let startX = 0
    let startY = 0
    let tracking = false

    const onStart = (e) => {
      const t = e.touches && e.touches[0]
      if (!t) return
      startX = t.clientX
      startY = t.clientY
      tracking = true
    }
    const onMove = (e) => {
      if (!tracking) return
      const t = e.touches && e.touches[0]
      if (!t) return
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      const verdict = classifyEdgeSwipe({ startX, dx, dy })
      if (verdict === 'none') return
      // Own the edge gesture once its horizontal intent is clear. Otherwise the
      // browser can navigate history while the overlay also closes itself. A
      // disabled nested interaction still claims the gesture; it suppresses
      // Back rather than handing the same swipe to browser history underneath.
      if (e.cancelable) e.preventDefault()
      if (disabled) return
      // A newer overlay registered on top of this one owns the gesture.
      if (register && !isEdgeBackTopmost(idRef.current)) return
      if (!register && overlaysOpen()) return
      if (verdict === 'back') {
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
  }, [disabled, onBack, register])
}
