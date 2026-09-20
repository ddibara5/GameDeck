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
export const NAV_TRANSITION_MS = 290
export const EDGE_BACK_PX = 24
export const EDGE_BACK_DX = 60
export const EDGE_BACK_COMMIT_RATIO = 0.32
export const EDGE_BACK_VELOCITY = 0.45
export const EDGE_BACK_MIN_FLING_DX = 24

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

export function edgeBackProgress(dx, width) {
  const w = Math.max(1, Number(width) || 1)
  return Math.max(0, Math.min(1, (Number(dx) || 0) / w))
}

export function shouldCompleteEdgeBack({
  dx,
  width,
  velocityX = 0,
  commitRatio = EDGE_BACK_COMMIT_RATIO,
  flingVelocity = EDGE_BACK_VELOCITY,
}) {
  const distance = Math.max(0, Number(dx) || 0)
  const w = Math.max(1, Number(width) || 1)
  if (distance / w >= commitRatio) return true
  return distance >= EDGE_BACK_MIN_FLING_DX && velocityX >= flingVelocity
}

function refsToElements(interactiveRef, interactiveRefs) {
  const refs = interactiveRefs || (interactiveRef ? [interactiveRef] : [])
  return refs.map((ref) => ref?.current).filter(Boolean)
}

function snapshotElement(el) {
  return {
    el,
    transform: el.style.transform,
    transition: el.style.transition,
    willChange: el.style.willChange,
  }
}

function restoreSnapshots(snapshots) {
  for (const snap of snapshots) {
    const { el } = snap
    if (!el?.isConnected) continue
    el.style.transform = snap.transform
    el.style.transition = snap.transition
    el.style.willChange = snap.willChange
    delete el.dataset.edgeBackDragging
    delete el.dataset.edgeBackCompleting
  }
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
export function useEdgeBack(
  onBack,
  {
    disabled = false,
    register = true,
    interactiveRef = null,
    interactiveRefs = null,
    deferBack = false,
    settleMs = NAV_TRANSITION_MS,
  } = {},
) {
  const idRef = useRef(0)
  const backRef = useRef(onBack)
  backRef.current = onBack

  useEffect(() => {
    if (!register) return undefined
    idRef.current = registerEdgeBack()
    const id = idRef.current
    return () => unregisterEdgeBack(id)
  }, [register])

  useEffect(() => {
    let startX = 0
    let startY = 0
    let tracking = false
    let interactive = false
    let snapshots = []
    let lastDx = 0
    let lastAt = 0
    let velocityX = 0
    let settleTimer = null

    const ownsGesture = () => {
      if (register && !isEdgeBackTopmost(idRef.current)) return false
      if (!register && overlaysOpen()) return false
      return true
    }

    const clearSettle = () => {
      if (settleTimer) {
        clearTimeout(settleTimer)
        settleTimer = null
      }
    }

    const settleBack = (duration = 160) => {
      for (const { el } of snapshots) {
        if (!el?.isConnected) continue
        delete el.dataset.edgeBackDragging
        el.style.transition = 'transform ' + duration + 'ms var(--ease-out)'
        el.style.transform = 'translate3d(0, 0, 0)'
      }
      settleTimer = setTimeout(() => {
        restoreSnapshots(snapshots)
        snapshots = []
        settleTimer = null
      }, duration + 24)
    }

    const completeInteractive = () => {
      const width = window.innerWidth || document.documentElement.clientWidth || 390
      const progress = edgeBackProgress(lastDx, width)
      const duration = Math.max(80, Math.min(settleMs, Math.round(settleMs * (1 - progress))))

      for (const { el } of snapshots) {
        if (!el?.isConnected) continue
        delete el.dataset.edgeBackDragging
        el.dataset.edgeBackCompleting = 'true'
        el.style.transition = 'transform ' + duration + 'ms var(--exit-ease)'
        el.style.transform = 'translate3d(' + width + 'px, 0, 0)'
      }

      if (deferBack) {
        settleTimer = setTimeout(() => {
          restoreSnapshots(snapshots)
          snapshots = []
          settleTimer = null
          backRef.current()
        }, duration)
      } else {
        backRef.current()
      }
    }

    const onStart = (e) => {
      clearSettle()
      const t = e.touches && e.touches[0]
      if (!t) return
      startX = t.clientX
      startY = t.clientY
      tracking = startX <= EDGE_BACK_PX
      interactive = false
      snapshots = []
      lastDx = 0
      lastAt = e.timeStamp || performance.now()
      velocityX = 0
    }

    const onMove = (e) => {
      if (!tracking) return
      const t = e.touches && e.touches[0]
      if (!t) return

      const dx = t.clientX - startX
      const dy = t.clientY - startY
      const verdict = classifyEdgeSwipe({ startX, dx, dy })
      if (verdict === 'none') return
      if (!ownsGesture()) return

      if (e.cancelable) e.preventDefault()
      if (disabled) return

      const targets = refsToElements(interactiveRef, interactiveRefs)
      if (!targets.length) {
        if (verdict === 'back') {
          backRef.current()
          tracking = false
        }
        return
      }

      if (!interactive) {
        snapshots = targets.map(snapshotElement)
        for (const { el } of snapshots) {
          el.dataset.edgeBackDragging = 'true'
          el.style.willChange = 'transform'
          el.style.transition = 'none'
        }
        interactive = true
      }

      const clampedDx = Math.max(0, dx)
      const now = e.timeStamp || performance.now()
      const dt = Math.max(1, now - lastAt)
      velocityX = Math.max(0, (clampedDx - lastDx) / dt)
      lastAt = now
      lastDx = clampedDx

      for (const { el } of snapshots) {
        if (el?.isConnected) el.style.transform = 'translate3d(' + clampedDx + 'px, 0, 0)'
      }
    }

    const finish = (cancelled = false) => {
      if (!tracking) return
      tracking = false
      if (!interactive) return
      const width = window.innerWidth || document.documentElement.clientWidth || 390
      if (!cancelled && shouldCompleteEdgeBack({ dx: lastDx, width, velocityX })) completeInteractive()
      else settleBack()
      interactive = false
    }

    const onEnd = () => finish(false)
    const onCancel = () => finish(true)

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      clearSettle()
      restoreSnapshots(snapshots)
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onCancel)
    }
  }, [disabled, register, interactiveRef, interactiveRefs, deferBack, settleMs])
}
