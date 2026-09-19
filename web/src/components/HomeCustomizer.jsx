import { useEffect, useRef, useState } from 'react'
import { useDialogA11y } from '../lib/useDialogA11y.js'
import { homeSectionOptions } from '../lib/homeLayout.js'
import './HomeCustomizer.css'

// Home section customizer: the Customize pill bar plus the editor sheet.
//
// Port of the Expo pilot's Sept 11 commit (src/components/home-customizer.tsx).
// The pilot drags rows with native gestures; on the web that becomes a
// pointer-based drag on the grip handle, with keyboard-accessible Move up /
// Move down buttons on every row. Toggling and reordering apply live through
// onChange; nothing is staged for a separate save step.
//
// This module is presentational and unwired: the caller owns `visible` and
// `layout` (loadHomeLayout / saveHomeLayout from ../lib/homeLayout.js) and
// passes changes back in through onChange.

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

const SLIDERS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
    <circle cx="16" cy="8" r="2.2" />
    <circle cx="10" cy="16" r="2.2" />
  </svg>
)

export function HomeCustomizeBar({ onPress }) {
  return (
    <button
      type="button"
      className="hc-bar"
      onClick={onPress}
      aria-label="Customize Home sections"
    >
      {SLIDERS}
      <span>Customize</span>
    </button>
  )
}

export function HomeCustomizeSheet({ visible, layout, onChange, onClose }) {
  if (!visible) return null
  return <HomeCustomizeSheetBody layout={layout} onChange={onChange} onClose={onClose} />
}

function HomeCustomizeSheetBody({ layout, onChange, onClose }) {
  const dialogRef = useDialogA11y({ active: true, onClose })
  const [draft, setDraft] = useState(layout)
  const [dragId, setDragId] = useState(null)
  const rowRefs = useRef({})
  // Latest draft for the window listeners, which outlive a render.
  const live = useRef(draft)
  live.current = draft

  function update(next) {
    // Keep the ref fresh synchronously: pointer moves can fire several times
    // between renders, and each reorder must build on the last one, not on
    // the last rendered draft.
    live.current = next
    setDraft(next)
    onChange(next)
  }

  function toggle(id, enabled) {
    const cur = live.current
    update({
      ...cur,
      hidden: enabled ? cur.hidden.filter((item) => item !== id) : [...cur.hidden, id],
    })
  }

  function move(from, to) {
    const cur = live.current
    if (to < 0 || to >= cur.order.length || from === to) return
    const order = [...cur.order]
    const [item] = order.splice(from, 1)
    order.splice(to, 0, item)
    update({ ...cur, order })
  }

  // Pointer drag on a grip handle: while held, the row swaps past neighbors
  // as the pointer crosses each row's midpoint, using live rects so it stays
  // correct while rows move under it. Changes commit live on every swap.
  useEffect(() => {
    if (!dragId) return undefined
    const reorder = (clientY) => {
      const cur = live.current.order
      const from = cur.indexOf(dragId)
      if (from === -1) return
      let target = cur.length - 1
      for (let i = 0; i < cur.length; i++) {
        const el = rowRefs.current[cur[i]]
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (clientY < rect.top + rect.height / 2) {
          target = i
          break
        }
      }
      if (target === from) return
      const order = cur.filter((id) => id !== dragId)
      order.splice(target > from ? target - 1 : target, 0, dragId)
      update({ ...live.current, order })
    }
    const onPointerMove = (event) => {
      reorder(event.clientY)
      if (event.cancelable) event.preventDefault()
    }
    const onPointerUp = () => setDragId(null)
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [dragId])

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="modal-sheet hc-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Customize Home sections"
      >
        <div className="modal-handle" />
        <div className="hc-head">
          <div className="detail-title">Home sections</div>
          <button type="button" className="hc-done" onClick={onClose}>
            Done
          </button>
        </div>
        <p className="hc-note">
          Show or hide sections, or drag the handles to change their order.
          Changes apply immediately.
        </p>
        <div className="hc-rows">
          {draft.order.map((id, index) => {
            const option = homeSectionOptions.find((item) => item.id === id)
            if (!option) return null
            const enabled = !draft.hidden.includes(id)
            return (
              <div
                key={id}
                ref={(el) => {
                  rowRefs.current[id] = el
                }}
                className={`hc-row${enabled ? '' : ' off'}${dragId === id ? ' dragging' : ''}`}
              >
                <span className="hc-label">{option.label}</span>
                <button
                  type="button"
                  className="hc-move"
                  aria-label={`Move ${option.label} up`}
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 15l6-6 6 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="hc-move"
                  aria-label={`Move ${option.label} down`}
                  disabled={index === draft.order.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                <label className="hc-switch">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => toggle(id, event.target.checked)}
                    aria-label={enabled ? `Hide ${option.label}` : `Show ${option.label}`}
                  />
                  <i aria-hidden="true" />
                </label>
                <span
                  className="hc-grip"
                  role="button"
                  aria-label={`Reorder ${option.label}`}
                  onPointerDown={(event) => {
                    event.preventDefault()
                    setDragId(id)
                  }}
                >
                  {GRIP}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
