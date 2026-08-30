import { useEffect, useRef, useState } from 'react'
import './lightbox.css'
import { useDialogA11y } from '../lib/useDialogA11y.js'

// Full-screen screenshot viewer. Opens from the game sheet's shot strip and shows
// the image at IGDB 1080p (the strip itself only loads screenshot_med).
//
// Gestures (all on one transform: translate(tx,ty) scale(s)):
//   - At fit (scale 1): swipe left/right to change shot, swipe down to close.
//   - Pinch with two fingers to zoom, anchored on the pinch midpoint.
//   - Double-tap (or double-click) to toggle zoom on the tapped point.
//   - When zoomed, one finger pans; double-tap or X returns to fit.
const HIRES = (u) => (u ? u.replace('t_screenshot_med', 't_1080p') : u)
const MAX_SCALE = 4
const TAP_SCALE = 2.5

export default function Lightbox({ shots, index, title, onClose }) {
  const [idx, setIdx] = useState(index || 0)
  const [zoomed, setZoomed] = useState(false)
  const stageRef = useRef(null)
  const imgRef = useRef(null)
  const dialogRef = useDialogA11y({ onClose, closeOnEscape: false })

  // Committed transform + the in-flight gesture + last-tap (for double-tap).
  const tf = useRef({ scale: 1, tx: 0, ty: 0 })
  const g = useRef({ mode: null })
  const tap = useRef({ t: 0, x: 0, y: 0 })

  const count = shots ? shots.length : 0

  const apply = (animate) => {
    const el = stageRef.current
    if (!el) return
    const { scale, tx, ty } = tf.current
    el.style.transition = animate ? 'transform 0.24s cubic-bezier(0.22,1,0.36,1)' : 'none'
    el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
    el.dataset.scale = String(scale)
  }

  const setScrim = (alpha) => {
    const lb = stageRef.current && stageRef.current.parentElement
    if (lb) lb.style.background = alpha == null ? '' : `rgba(8, 6, 5, ${alpha})`
  }

  const reset = (animate) => {
    tf.current = { scale: 1, tx: 0, ty: 0 }
    apply(animate)
    setScrim(null)
    setZoomed(false)
  }

  // Reset the transform whenever the shot changes or the viewer reopens.
  useEffect(() => {
    reset(false)
  }, [idx])
  useEffect(() => {
    setIdx(index || 0)
  }, [index])

  const clamp = () => {
    const el = imgRef.current
    if (!el) return
    const s = tf.current.scale
    const maxX = Math.max(0, (el.offsetWidth * s - window.innerWidth) / 2)
    const maxY = Math.max(0, (el.offsetHeight * s - window.innerHeight) / 2)
    tf.current.tx = Math.max(-maxX, Math.min(maxX, tf.current.tx))
    tf.current.ty = Math.max(-maxY, Math.min(maxY, tf.current.ty))
  }

  const go = (next) => {
    if (next < 0 || next >= count) return
    setIdx(next)
  }

  // Keyboard: arrows navigate (at fit), Escape closes.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' && tf.current.scale <= 1.01) go(idx + 1)
      else if (e.key === 'ArrowLeft' && tf.current.scale <= 1.01) go(idx - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [count, idx, onClose])

  const distance = (a, b) => Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)

  const toggleZoom = (x, y) => {
    if (tf.current.scale > 1.01) {
      reset(true)
      return
    }
    const fx = x - window.innerWidth / 2
    const fy = y - window.innerHeight / 2
    tf.current.scale = TAP_SCALE
    tf.current.tx = fx * (1 - TAP_SCALE)
    tf.current.ty = fy * (1 - TAP_SCALE)
    clamp()
    apply(true)
    setZoomed(true)
  }

  function onStart(e) {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]]
      g.current = {
        mode: 'pinch',
        startDist: distance(a, b) || 1,
        startScale: tf.current.scale,
        startTx: tf.current.tx,
        startTy: tf.current.ty,
        fx: (a.clientX + b.clientX) / 2 - window.innerWidth / 2,
        fy: (a.clientY + b.clientY) / 2 - window.innerHeight / 2,
      }
    } else if (e.touches.length === 1) {
      const t = e.touches[0]
      if (tf.current.scale > 1.01) {
        g.current = { mode: 'pan', startX: t.clientX, startY: t.clientY, startTx: tf.current.tx, startTy: tf.current.ty }
      } else {
        g.current = { mode: 'swipe', startX: t.clientX, startY: t.clientY, axis: null }
      }
    }
  }

  function onMove(e) {
    const gc = g.current
    if (!gc.mode) return
    if (gc.mode === 'pinch' && e.touches.length >= 2) {
      const [a, b] = [e.touches[0], e.touches[1]]
      const s = Math.max(1, Math.min(MAX_SCALE, (gc.startScale * distance(a, b)) / gc.startDist))
      const r = s / gc.startScale
      tf.current.scale = s
      tf.current.tx = gc.fx - (gc.fx - gc.startTx) * r
      tf.current.ty = gc.fy - (gc.fy - gc.startTy) * r
      clamp()
      apply(false)
    } else if (gc.mode === 'pan') {
      const t = e.touches[0]
      tf.current.tx = gc.startTx + (t.clientX - gc.startX)
      tf.current.ty = gc.startTy + (t.clientY - gc.startY)
      clamp()
      apply(false)
    } else if (gc.mode === 'swipe') {
      const t = e.touches[0]
      const dx = t.clientX - gc.startX
      const dy = t.clientY - gc.startY
      if (!gc.axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) gc.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (gc.axis === 'x') {
        const atEdge = (dx > 0 && idx === 0) || (dx < 0 && idx === count - 1)
        tf.current.tx = atEdge ? dx * 0.3 : dx
        tf.current.ty = 0
        apply(false)
      } else if (gc.axis === 'y' && dy > 0) {
        tf.current.ty = dy
        tf.current.tx = 0
        apply(false)
        setScrim(Math.max(0.4, 1 - dy / 400))
      }
    }
  }

  function onEnd(e) {
    const gc = g.current
    if (gc.mode === 'pinch') {
      // A finger lifted: if one remains, continue as a pan; otherwise settle.
      if (e.touches.length === 1) {
        const t = e.touches[0]
        g.current = { mode: 'pan', startX: t.clientX, startY: t.clientY, startTx: tf.current.tx, startTy: tf.current.ty }
        return
      }
      if (tf.current.scale <= 1.01) reset(true)
      else {
        setZoomed(true)
        apply(true)
      }
      g.current = { mode: null }
      return
    }
    if (gc.mode === 'pan') {
      if (e.touches.length === 0) g.current = { mode: null }
      return
    }
    if (gc.mode === 'swipe') {
      if (gc.axis === 'x') {
        if (tf.current.tx <= -60 && idx < count - 1) setIdx(idx + 1)
        else if (tf.current.tx >= 60 && idx > 0) setIdx(idx - 1)
        else {
          tf.current.tx = 0
          apply(true)
        }
      } else if (gc.axis === 'y') {
        if (tf.current.ty > 90) onClose()
        else {
          tf.current.ty = 0
          apply(true)
          setScrim(null)
        }
      } else {
        // No movement: treat as a tap and watch for a double-tap.
        const t = (e.changedTouches && e.changedTouches[0]) || null
        const x = t ? t.clientX : window.innerWidth / 2
        const y = t ? t.clientY : window.innerHeight / 2
        const now = e.timeStamp || 0
        if (now - tap.current.t < 300 && Math.abs(x - tap.current.x) < 40 && Math.abs(y - tap.current.y) < 40) {
          tap.current.t = 0
          toggleZoom(x, y)
        } else {
          tap.current = { t: now, x, y }
        }
      }
      g.current = { mode: null }
      return
    }
    g.current = { mode: null }
  }

  if (!shots || !count) return null

  return (
    <div
      ref={dialogRef}
      className="lb"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} screenshots`}
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
        ref={stageRef}
        onTouchStart={onStart}
        onTouchMove={onMove}
        onTouchEnd={onEnd}
        onDoubleClick={(e) => toggleZoom(e.clientX, e.clientY)}
      >
        <img
          className="lb-img"
          ref={imgRef}
          src={HIRES(shots[idx])}
          alt={`${title} screenshot ${idx + 1}`}
          draggable="false"
        />
      </div>

      {count > 1 && !zoomed ? (
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
        </>
      ) : null}

      {count > 1 ? (
        <div className="lb-count">
          {idx + 1} / {count}
        </div>
      ) : null}
    </div>
  )
}
