import { useEffect, useRef, useState } from 'react'
import { useMountTransition } from '../lib/useMountTransition.js'
import { lockScroll } from '../lib/scrollLock.js'
import { TAB_BY_KEY, MIN_VISIBLE, getNavConfig, setNavConfig, resetNavConfig } from '../lib/navConfig.js'
import { TAB_ICONS } from './TabBar.jsx'
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

// Full-screen editor for the bottom tab bar: reorder tabs by dragging, toggle a
// tab off to move it into the drawer's "More" list, and switch text labels on or
// off. Saved to localStorage; the tab bar reads the same config live. Reuses the
// Settings page shell (open/close animation + edge-back).
export default function CustomizeNav({ open, onClose }) {
  const { mounted, closing } = useMountTransition(open)
  const [order, setOrder] = useState(() => getNavConfig().order)
  const [enabled, setEnabled] = useState(() => getNavConfig().enabled)
  const [labels, setLabels] = useState(() => getNavConfig().labels)
  const [dragKey, setDragKey] = useState(null)
  const itemRefs = useRef({})
  // Latest state for listeners that outlive a render.
  const live = useRef({ order, enabled, labels })
  live.current = { order, enabled, labels }

  const visibleCount = order.filter((k) => enabled[k]).length
  const atFloor = visibleCount <= MIN_VISIBLE

  // Re-sync from storage each time the page opens.
  useEffect(() => {
    if (!open) return
    const c = getNavConfig()
    setOrder(c.order)
    setEnabled(c.enabled)
    setLabels(c.labels)
  }, [open])

  function commit(next) {
    if (next.order) setOrder(next.order)
    if (next.enabled) setEnabled(next.enabled)
    if ('labels' in next) setLabels(next.labels)
    const merged = {
      order: next.order || live.current.order,
      enabled: next.enabled || live.current.enabled,
      labels: 'labels' in next ? next.labels : live.current.labels,
    }
    setNavConfig(merged)
  }

  function toggle(key) {
    const turningOff = enabled[key]
    // Enforce the visible-tab floor: block the toggle that would drop below it.
    if (turningOff && atFloor) return
    commit({ enabled: { ...enabled, [key]: !enabled[key] } })
  }

  function toggleLabels() {
    commit({ labels: !labels })
  }

  function doReset() {
    const c = resetNavConfig()
    setOrder(c.order)
    setEnabled(c.enabled)
    setLabels(c.labels)
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
      setNavConfig({ order: live.current.order, enabled: live.current.enabled, labels: live.current.labels })
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
    <div className={`settings-page${closing ? ' closing' : ''}`} role="dialog" aria-label="Navigation">
      <div className="settings-hd">
        <button type="button" className="settings-back" onClick={onClose} aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <h2 className="settings-hd-title">Navigation</h2>
      </div>

      <div className="settings-body">
        <div className="cz-note">Drag to reorder your tab bar. Toggle a tab off to move it into the menu. At least {MIN_VISIBLE} tabs stay in the bar.</div>

        <div className="cz-group">
          {order.map((key) => {
            const meta = TAB_BY_KEY[key]
            if (!meta) return null
            const on = Boolean(enabled[key])
            // Block only the switch that would breach the floor; others stay live.
            const lockOff = on && atFloor
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
                  aria-label={`Reorder ${meta.label}`}
                  onPointerDown={(e) => {
                    e.preventDefault()
                    setDragKey(key)
                  }}
                >
                  {GRIP}
                </span>
                <span className="cz-tab-icon" aria-hidden="true">
                  {TAB_ICONS[key]}
                </span>
                <span className="cz-rl">
                  <b>{meta.label}</b>
                  {on ? null : <small>In menu</small>}
                </span>
                <button
                  type="button"
                  className={`cz-toggle${on ? ' on' : ''}`}
                  role="switch"
                  aria-checked={on}
                  aria-label={`${on ? 'Move to menu' : 'Show in bar'}: ${meta.label}`}
                  onClick={() => toggle(key)}
                  disabled={lockOff}
                >
                  <i />
                </button>
              </div>
            )
          })}
        </div>

        <div className="cz-note" style={{ paddingTop: 18 }}>Appearance</div>
        <div className="cz-group">
          <div className="cz-row">
            <span className="cz-rl">
              <b>Show labels</b>
              <small>Text under each tab icon</small>
            </span>
            <button
              type="button"
              className={`cz-toggle${labels ? ' on' : ''}`}
              role="switch"
              aria-checked={labels}
              aria-label="Show tab labels"
              onClick={toggleLabels}
            >
              <i />
            </button>
          </div>
        </div>

        <button type="button" className="cz-reset" onClick={doReset}>
          Reset to default
        </button>
      </div>
    </div>
  )
}
