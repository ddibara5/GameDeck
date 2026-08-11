import { useEffect, useRef, useState } from 'react'
import { useMountTransition } from '../lib/useMountTransition.js'
import { lockScroll } from '../lib/scrollLock.js'
import { ROW_BY_KEY, getRowsConfig, setRowsConfig, resetRowsConfig } from '../lib/discoverRows.js'
import './customizeRows.css'

const GRIP = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="9" cy="6" r="1.6" />
    <circle cx="15" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" />
    <circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" />
    <circle cx="15" cy="18" r="1.6" />
  </svg>
)

// Full-screen editor for the Discover home rows: reorder by dragging the handle,
// toggle a row on/off. Saved to localStorage; the Discover home reads the same
// config live. Reuses the Settings page shell (open/close animation + edge-back).
export default function CustomizeRows({ open, onClose }) {
  const { mounted, closing } = useMountTransition(open)
  const [order, setOrder] = useState(() => getRowsConfig().order)
  const [enabled, setEnabled] = useState(() => getRowsConfig().enabled)
  const [dragKey, setDragKey] = useState(null)
  const itemRefs = useRef({})
  // Latest order/enabled for listeners that outlive a render.
  const live = useRef({ order, enabled })
  live.current = { order, enabled }

  // Re-sync from storage each time the page opens.
  useEffect(() => {
    if (!open) return
    const c = getRowsConfig()
    setOrder(c.order)
    setEnabled(c.enabled)
  }, [open])

  function commit(nextOrder, nextEnabled) {
    setOrder(nextOrder)
    setEnabled(nextEnabled)
    setRowsConfig({ order: nextOrder, enabled: nextEnabled })
  }

  function toggle(key) {
    commit(order, { ...enabled, [key]: !enabled[key] })
  }

  function doReset() {
    const c = resetRowsConfig()
    setOrder(c.order)
    setEnabled(c.enabled)
  }

  // Close on Escape.
  useEffect(() => {
    if (!mounted) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mounted, onClose])

  // Lock background scroll while open.
  useEffect(() => {
    if (!mounted) return undefined
    return lockScroll()
  }, [mounted])

  // iOS edge-back: swipe in from the left edge to go back (disabled mid-drag).
  useEffect(() => {
    if (!mounted) return undefined
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
      if (!tracking || dragKey) return
      const t = e.touches && e.touches[0]
      if (!t) return
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (Math.abs(dx) <= Math.abs(dy)) return
      if (fromEdge && dx > BACK_DX) {
        onClose()
        tracking = false
      }
    }
    const onEnd = () => {
      tracking = false
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [mounted, dragKey, onClose])

  // Drag-to-reorder: while a handle is held, reorder as the pointer crosses each
  // row's midpoint, using live rects so it stays correct across re-renders.
  useEffect(() => {
    if (!dragKey) return undefined
    const move = (clientY) => {
      const cur = live.current.order
      let target = cur.length
      for (let i = 0; i < cur.length; i++) {
        const el = itemRefs.current[cur[i]]
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (clientY < r.top + r.height / 2) {
          target = i
          break
        }
      }
      const from = cur.indexOf(dragKey)
      if (from === -1 || target === from) return
      const next = cur.filter((k) => k !== dragKey)
      next.splice(target > from ? target - 1 : target, 0, dragKey)
      setOrder(next)
    }
    const onPointerMove = (e) => {
      move(e.clientY)
      if (e.cancelable) e.preventDefault()
    }
    const onTouchMove = (e) => {
      if (e.touches && e.touches[0]) move(e.touches[0].clientY)
      if (e.cancelable) e.preventDefault()
    }
    const onUp = () => {
      setDragKey(null)
      setRowsConfig({ order: live.current.order, enabled: live.current.enabled })
    }
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [dragKey])

  if (!mounted) return null

  return (
    <div className={`settings-page${closing ? ' closing' : ''}`} role="dialog" aria-label="Customize rows">
      <div className="settings-hd">
        <button type="button" className="settings-back" onClick={onClose} aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <h2 className="settings-hd-title">Customize rows</h2>
      </div>

      <div className="settings-body">
        <div className="cz-note">Drag the handle to reorder. Toggle a row off to hide it from Discover.</div>

        <div className="cz-group">
          {order.map((key) => {
            const row = ROW_BY_KEY[key]
            if (!row) return null
            const on = Boolean(enabled[key])
            return (
              <div
                key={key}
                ref={(el) => {
                  itemRefs.current[key] = el
                }}
                className={`cz-row${on ? '' : ' off'}${dragKey === key ? ' dragging' : ''}`}
              >
                <span
                  className="cz-grip"
                  role="button"
                  aria-label={`Reorder ${row.label}`}
                  onPointerDown={(e) => {
                    e.preventDefault()
                    setDragKey(key)
                  }}
                >
                  {GRIP}
                </span>
                <span className="cz-rl">
                  <b>{row.label}</b>
                  {row.sub ? <small>{row.sub}</small> : null}
                </span>
                <button
                  type="button"
                  className={`cz-toggle${on ? ' on' : ''}`}
                  role="switch"
                  aria-checked={on}
                  aria-label={`${on ? 'Hide' : 'Show'} ${row.label}`}
                  onClick={() => toggle(key)}
                >
                  <i />
                </button>
              </div>
            )
          })}
        </div>

        <button type="button" className="cz-reset" onClick={doReset}>
          Reset to default
        </button>
      </div>
    </div>
  )
}
