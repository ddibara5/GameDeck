import { useCallback, useEffect, useRef, useState } from 'react'

// Pull-to-refresh, with the per-frame work kept out of React.
//
// The previous version stored the drag offset in component state, so every
// touchmove re-rendered the whole tab - seven cards and their game rows - just
// to move a gutter a few pixels. Here the offset is written straight to the
// element through a ref inside a requestAnimationFrame, and React only ever
// hears about the coarse phase (working / done), which changes at most twice
// per gesture. Dragging causes zero re-renders.

const THRESHOLD = 68
const MAX = 90
const WORKING_H = 40
// The refresh spends real LLM budget on the n8n side, so the client holds its
// own cooldown on top of the workflow's already-running guard. Inside it, a
// pull still re-reads the table; it just does not ask for another run.
const COOLDOWN_MS = 5 * 60 * 1000
const COOLDOWN_KEY = 'gamedeck_news_refresh_at'
const DONE_MS = 1600

function lastRunAt() {
  try {
    return Number(sessionStorage.getItem(COOLDOWN_KEY)) || 0
  } catch {
    return 0
  }
}

function stampRun() {
  try {
    sessionStorage.setItem(COOLDOWN_KEY, String(Date.now()))
  } catch {
    // ignore storage failures
  }
}

export default function usePullRefresh({ onRefresh }) {
  const gutterRef = useRef(null)
  const labelRef = useRef(null)
  const spinRef = useRef(null)

  const [phase, setPhase] = useState('idle')
  const [note, setNote] = useState('')

  const drag = useRef({ startY: 0, active: false, y: 0, armed: false, raf: 0 })
  const busyRef = useRef(false)
  const aliveRef = useRef(true)

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
    if (busyRef.current) return
    busyRef.current = true
    setPhase('working')
    settle(WORKING_H, 'Fetching new stories', true)

    const canTrigger = Date.now() - lastRunAt() > COOLDOWN_MS
    if (canTrigger) stampRun()

    let result = ''
    try {
      result = (await onRefresh({ canTrigger })) || 'Up to date'
    } catch {
      result = 'Could not refresh'
    }
    if (!aliveRef.current) return

    setPhase('done')
    setNote(result)
    settle(WORKING_H, result, false)

    setTimeout(() => {
      if (!aliveRef.current) return
      busyRef.current = false
      setPhase('idle')
      settle(0, '', false)
    }, DONE_MS)
  }, [onRefresh, settle])

  const onTouchStart = useCallback((e) => {
    if (window.scrollY > 0 || busyRef.current) return
    drag.current.startY = e.touches[0].clientY
    drag.current.active = true
    drag.current.armed = false
    gutterRef.current?.classList.add('dragging')
  }, [])

  const onTouchMove = useCallback(
    (e) => {
      const d = drag.current
      if (!d.active) return
      const dy = e.touches[0].clientY - d.startY
      // A downward drag that starts anywhere but the very top is a scroll, not
      // a pull; hand it back rather than fighting the scroller.
      if (dy <= 0 || window.scrollY > 0) {
        d.y = 0
        d.armed = false
        if (!d.raf) d.raf = requestAnimationFrame(flush)
        return
      }
      d.y = Math.min(dy * 0.5, MAX) // damped
      d.armed = d.y >= THRESHOLD
      if (!d.raf) d.raf = requestAnimationFrame(flush)

      function flush() {
        d.raf = 0
        paint(d.y, d.armed ? 'Release to refresh' : 'Pull to refresh', d.armed)
      }
    },
    [paint],
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
    spinRef,
    phase,
    note,
    busy: phase === 'working',
    refreshNow: run,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: onTouchEnd,
      className: 'news-pull-host',
    },
  }
}
