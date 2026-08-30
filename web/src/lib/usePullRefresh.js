import { useCallback, useEffect, useRef, useState } from 'react'

// Pull-to-refresh, with the per-frame work kept out of React.
//
// The previous version stored the drag offset in component state, so every
// touchmove re-rendered the whole tab - seven cards and their game rows - just
// to move a gutter a few pixels. Here the offset is written straight to the
// element through a ref inside a requestAnimationFrame, and React only ever
// hears about the coarse phase (working / done), which changes at most twice
// per gesture. Dragging causes zero re-renders.

const THRESHOLD = 62
const MAX = 84
const WORKING_H = 40
const DONE_MS = 1200

export default function usePullRefresh({
  onRefresh,
  disabled = false,
  workingLabel = 'Refreshing…',
  doneLabel = 'Updated',
  errorLabel = 'Couldn\'t refresh',
}) {
  const gutterRef = useRef(null)
  const labelRef = useRef(null)

  const [phase, setPhase] = useState('idle')

  const drag = useRef({ startX: 0, startY: 0, active: false, y: 0, armed: false, raf: 0 })
  const busyRef = useRef(false)
  const aliveRef = useRef(true)
  const onRefreshRef = useRef(onRefresh)
  const disabledRef = useRef(disabled)

  onRefreshRef.current = onRefresh
  disabledRef.current = disabled

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      if (drag.current.raf) cancelAnimationFrame(drag.current.raf)
    }
  }, [])

  // The only place the gutter is painted. Called from rAF during a drag and
  // directly on the state transitions, so there is exactly one writer.
  const paint = useCallback((h, label, armed) => {
    const g = gutterRef.current
    if (g) {
      g.style.height = `${h}px`
      g.classList.toggle('armed', Boolean(armed))
      g.classList.toggle('on', h > 0)
    }
    if (labelRef.current) labelRef.current.textContent = label
  }, [])

  const settle = useCallback(
    (h, label, armed) => {
      gutterRef.current?.classList.remove('dragging')
      paint(h, label, armed)
    },
    [paint],
  )

  const run = useCallback(async () => {
    if (busyRef.current || disabledRef.current) return
    busyRef.current = true
    setPhase('working')
    settle(WORKING_H, workingLabel, true)

    let result = doneLabel
    try {
      result = (await onRefreshRef.current()) || doneLabel
    } catch {
      result = errorLabel
    }
    if (!aliveRef.current) return

    setPhase('done')
    settle(WORKING_H, result, false)

    setTimeout(() => {
      if (!aliveRef.current) return
      busyRef.current = false
      setPhase('idle')
      settle(0, '', false)
    }, DONE_MS)
  }, [doneLabel, errorLabel, settle, workingLabel])

  const onTouchStart = useCallback((e) => {
    if (window.scrollY > 0 || busyRef.current || disabledRef.current) return
    drag.current.startX = e.touches[0].clientX
    drag.current.startY = e.touches[0].clientY
    drag.current.active = true
    drag.current.armed = false
    gutterRef.current?.classList.add('dragging')
  }, [])

  const onTouchMove = useCallback(
    (e) => {
      const d = drag.current
      if (!d.active) return
      const dx = e.touches[0].clientX - d.startX
      const dy = e.touches[0].clientY - d.startY
      if (Math.abs(dx) > Math.abs(dy)) {
        d.active = false
        d.y = 0
        d.armed = false
        settle(0, '', false)
        return
      }
      // A downward drag that starts anywhere but the very top is a scroll, not
      // a pull; hand it back rather than fighting the scroller.
      if (dy <= 0 || window.scrollY > 0) {
        d.y = 0
        d.armed = false
        if (!d.raf) d.raf = requestAnimationFrame(flush)
        return
      }
      if (e.cancelable) e.preventDefault()
      d.y = Math.min(dy * 0.5, MAX) // damped
      d.armed = d.y >= THRESHOLD
      if (!d.raf) d.raf = requestAnimationFrame(flush)

      function flush() {
        d.raf = 0
        paint(d.y, d.armed ? 'Release to refresh' : 'Pull to refresh', d.armed)
      }
    },
    [paint, settle],
  )

  const onTouchEnd = useCallback(() => {
    const d = drag.current
    if (!d.active) return
    d.active = false
    if (d.raf) {
      cancelAnimationFrame(d.raf)
      d.raf = 0
    }
    if (d.armed) {
      d.y = 0
      d.armed = false
      run()
      return
    }
    d.y = 0
    // Retract with a transition rather than snapping to zero, which is what the
    // gutter used to do.
    settle(0, '', false)
  }, [run, settle])

  return {
    gutterRef,
    labelRef,
    phase,
    busy: phase === 'working',
    refreshNow: run,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: onTouchEnd,
      className: 'pull-refresh-host',
    },
  }
}
