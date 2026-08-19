import { Fragment, useEffect, useRef, useState } from 'react'
import { useMountTransition } from '../lib/useMountTransition.js'
import { lockScroll } from '../lib/scrollLock.js'
import { useEdgeBack } from '../lib/useEdgeBack.js'
import './customizeRows.css'

// The reorder-and-toggle editor, shared by Discover's rows and Insights' cards.
//
// This was CustomizeRows until Insights needed the same thing. Copying it would
// have made a second 250-line copy of the drag maths, the edge-back gesture and
// the scroll lock, and this codebase has already paid for that pattern twice:
// three private copies of the platform labels, and two column lists for the
// Library that drifted the first time one changed.
//
// It stays uncontrolled on purpose. The caller hands over a catalog and the four
// storage functions; the open/close animation, the pointer handling and the
// commit-on-drop all live here, because none of that differs between surfaces.
//
// Props:
//   open, onClose      visibility, owned by the caller
//   title, note        header text and the line above the list
//   byKey              { [key]: { label, sub, group } }
//   groupLabel         optional { [group]: 'Heading' }; omit for a flat list
//   getConfig / setConfig / resetConfig   the storage module's API

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

export default function CustomizeList({
  open,
  onClose,
  title,
  note,
  byKey,
  groupLabel = null,
  getConfig,
  setConfig,
  resetConfig,
}) {
  const { mounted, closing } = useMountTransition(open)
  const [order, setOrder] = useState(() => getConfig().order)
  const [enabled, setEnabled] = useState(() => getConfig().enabled)
  const [dragKey, setDragKey] = useState(null)
  const itemRefs = useRef({})
  // Latest order/enabled for listeners that outlive a render.
  const live = useRef({ order, enabled })
  live.current = { order, enabled }

  // Re-sync from storage each time the page opens.
  useEffect(() => {
    if (!open) return
    const c = getConfig()
    setOrder(c.order)
    setEnabled(c.enabled)
  }, [open, getConfig])

  function commit(nextOrder, nextEnabled) {
    setOrder(nextOrder)
    setEnabled(nextEnabled)
    setConfig({ order: nextOrder, enabled: nextEnabled })
  }

  function toggle(key) {
    commit(order, { ...enabled, [key]: !enabled[key] })
  }

  function doReset() {
    const c = resetConfig()
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
      setConfig({ order: live.current.order, enabled: live.current.enabled })
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
  }, [dragKey, setConfig])

  // Registers with overlaysOpen() while up, so App suppresses its drawer swipe.
  // Disabled mid-drag: the reorder owns the pointer, and backing out from under
  // it would drop the row somewhere the user did not choose.
  useEdgeBack(onClose, { disabled: !mounted || Boolean(dragKey) })

  if (!mounted) return null

  // Group headings are printed as the list is walked rather than by grouping the
  // list first, because the ORDER is the user's and must not be reshuffled to
  // suit the headings. Drag a lifetime card to the top and its heading follows it
  // there; that is the honest rendering of what they did.
  let lastGroup = null

  return (
    <div className={`settings-page${closing ? ' closing' : ''}`} role="dialog" aria-label={title}>
      <div className="settings-hd">
        <button type="button" className="settings-back" onClick={onClose} aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <h2 className="settings-hd-title">{title}</h2>
      </div>

      <div className="settings-body">
        <div className="cz-note">{note}</div>

        <div className="cz-group">
          {order.map((key) => {
            const item = byKey[key]
            if (!item) return null
            const on = Boolean(enabled[key])
            const heading = groupLabel && item.group && item.group !== lastGroup ? groupLabel[item.group] : null
            if (item.group) lastGroup = item.group
            return (
              <Fragment key={key}>
                {heading ? <div className="cz-sec">{heading}</div> : null}
                <div
                  ref={(el) => {
                    itemRefs.current[key] = el
                  }}
                  className={`cz-row${on ? '' : ' off'}${dragKey === key ? ' dragging' : ''}`}
                >
                  <span
                    className="cz-grip"
                    role="button"
                    aria-label={`Reorder ${item.label}`}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      setDragKey(key)
                    }}
                  >
                    {GRIP}
                  </span>
                  <span className="cz-rl">
                    <b>{item.label}</b>
                    {item.sub ? <small>{item.sub}</small> : null}
                  </span>
                  <button
                    type="button"
                    className={`cz-toggle${on ? ' on' : ''}`}
                    role="switch"
                    aria-checked={on}
                    aria-label={`${on ? 'Hide' : 'Show'} ${item.label}`}
                    onClick={() => toggle(key)}
                  >
                    <i />
                  </button>
                </div>
              </Fragment>
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
