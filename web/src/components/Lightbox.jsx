import { useEffect, useRef, useState } from 'react'
import './lightbox.css'

// Full-screen screenshot viewer. Opens from the game sheet's shot strip and shows
// the image at IGDB 1080p (the strip itself only loads screenshot_med). Swipe
// left/right to move between shots, swipe down or tap the backdrop / X to close.
const HIRES = (u) => (u ? u.replace('t_screenshot_med', 't_1080p') : u)

export default function Lightbox({ shots, index, title, onClose }) {
  const [idx, setIdx] = useState(index || 0)
  const [dragX, setDragX] = useState(0)
  const [dragY, setDragY] = useState(0)
  const touch = useRef({ x: 0, y: 0, axis: null, active: false })

  // Re-seed when reopened at a different shot.
  useEffect(() => {
    setIdx(index || 0)
  }, [index])

  const count = shots ? shots.length : 0
  const go = (next) => {
    if (next < 0 || next >= count) return
    setIdx(next)
    setDragX(0)
  }

  // Keyboard: arrows to navigate, Escape to close.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') setIdx((i) => Math.min(count - 1, i + 1))
      else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [count, onClose])

  function onStart(e) {
    const t = e.touches[0]
    touch.current = { x: t.clientX, y: t.clientY, axis: null, active: true }
  }
  function onMove(e) {
    if (!touch.current.active) return
    const t = e.touches[0]
    const dx = t.clientX - touch.current.x
    const dy = t.clientY - touch.current.y
    if (!touch.current.axis) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) touch.current.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    if (touch.current.axis === 'x') {
      // Resist swiping past the first/last shot.
      const atEdge = (dx > 0 && idx === 0) || (dx < 0 && idx === count - 1)
      setDragX(atEdge ? dx * 0.3 : dx)
      if (e.cancelable) e.preventDefault()
    } else if (touch.current.axis === 'y' && dy > 0) {
      setDragY(dy)
      if (e.cancelable) e.preventDefault()
    }
  }
  function onEnd() {
    const { axis } = touch.current
    touch.current.active = false
    if (axis === 'x') {
      if (dragX <= -60 && idx < count - 1) setIdx(idx + 1)
      else if (dragX >= 60 && idx > 0) setIdx(idx - 1)
      setDragX(0)
    } else if (axis === 'y') {
      if (dragY > 90) onClose()
      else setDragY(0)
    }
  }

  if (!shots || !count) return null

  const dragging = touch.current.active
  const scrimAlpha = Math.max(0.4, 1 - dragY / 400)

  return (
    <div
      className="lb"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} screenshots`}
      style={{ background: `rgba(8, 6, 5, ${scrimAlpha})` }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <button type="button" className="lb-close" onClick={onClose} aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      <div
        className="lb-stage"
        onTouchStart={onStart}
        onTouchMove={onMove}
        onTouchEnd={onEnd}
        style={{
          transform: `translate(${dragX}px, ${dragY}px)`,
          transition: dragging ? 'none' : 'transform 0.22s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <img className="lb-img" src={HIRES(shots[idx])} alt={`${title} screenshot ${idx + 1}`} draggable="false" />
      </div>

      {count > 1 ? (
        <>
          <button
            type="button"
            className="lb-nav prev"
            onClick={() => go(idx - 1)}
            disabled={idx === 0}
            aria-label="Previous screenshot"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <button
            type="button"
            className="lb-nav next"
            onClick={() => go(idx + 1)}
            disabled={idx === count - 1}
            aria-label="Next screenshot"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
          <div className="lb-count">
            {idx + 1} / {count}
          </div>
        </>
      ) : null}
    </div>
  )
}
