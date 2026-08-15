import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { optImg } from '../lib/format.js'

/**
 * Lazy-loaded game cover image with a walnut placeholder fallback showing
 * the title's initial when the src is missing or fails to load.
 *
 * IGDB art is routed through the wsrv.nl image CDN (resized to the display size
 * and served as WebP) for faster loads. If the CDN ever fails for an image, we
 * fall back to the original IGDB URL, then to the placeholder, so a CDN hiccup
 * never leaves a blank cover.
 */

// Widths we are willing to ask the CDN for. Snapping to a ladder instead of
// asking for the exact pixel count keeps the number of distinct wsrv URLs small,
// so a cover already fetched at one breakpoint or device pixel ratio is a cache
// hit at the next rather than a cold resize.
const WIDTH_LADDER = [96, 128, 160, 192, 224, 256, 320, 384, 448, 512, 640]

function snapWidth(px) {
  for (const w of WIDTH_LADDER) if (px <= w) return w
  return WIDTH_LADDER[WIDTH_LADDER.length - 1]
}

// The slot is measured rather than passed in, because every slot in this app is
// sized by a CSS variable the user can change in Settings > Appearance:
// --list-thumb is 52 / 66 / 84 and --shelf-pw is 116 / 146 / 174. A width baked
// into the call site would be right at one setting and wrong at the other two.
//
// Measured before paint, in a layout effect, so the first painted <img> already
// carries the right src. Doing it in useEffect would paint a default-width image
// and then swap it, which is two requests for one cover.
//
// Before this, every non-lg cover asked for 224px regardless of slot. Measured on
// the Library at 402px / DPR 2, that was a 66px slot receiving a 224px image:
// 1.7x too wide, so 2.9x the pixels actually needed. The lg default of 480 was
// closer but still loose. The Discover rails at the Medium setting want 292 and
// were being served 264, so they were slightly UNDER-served - which is why this
// is measured per slot rather than fixed to a smaller constant.
const FALLBACK_W = { lg: 480, sm: 224 }

// A slot that is laid out at zero width (inside something not yet displayed)
// would otherwise never render its image at all. ResizeObserver covers that: it
// fires as soon as the box has a size. Where it does not exist, fall back to the
// old behaviour and render immediately at the default width, because a slightly
// oversized cover beats no cover.
const HAS_RO = typeof ResizeObserver !== 'undefined'

export default function Cover({ src, title, size = 'sm', className = '' }) {
  const [failed, setFailed] = useState(false)
  const [rawFallback, setRawFallback] = useState(false)
  const boxRef = useRef(null)
  const [slotW, setSlotW] = useState(0)

  // Reset the load state whenever the source changes (e.g. the sheet cover
  // swaps in richer art once its IGDB media resolves).
  useEffect(() => {
    setFailed(false)
    setRawFallback(false)
  }, [src])

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return undefined
    const read = () => {
      const w = Math.round(el.getBoundingClientRect().width)
      // Only ever grow the request. A cover that is briefly narrow mid-animation
      // must not cause a second, smaller fetch of something already loaded.
      if (w > 0) setSlotW((prev) => (w > prev ? w : prev))
    }
    read()
    if (!HAS_RO) return undefined
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const initial = (title || '?').trim().charAt(0).toUpperCase() || '?'
  const sizeClass = size === 'lg' ? 'cover-lg' : 'cover-sm'

  const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1
  // Cap the ratio at 2. Beyond that the extra pixels are past what the eye
  // resolves at these sizes and cost more than the sharpness is worth; optImg
  // caps again at the source bucket's own width.
  const targetW = slotW ? snapWidth(Math.ceil(slotW * Math.min(dpr, 2))) : FALLBACK_W[size] || FALLBACK_W.sm
  const optimized = optImg(src, targetW)
  const shown = rawFallback ? src : optimized
  // Hold the image back for the one layout pass before the slot has been
  // measured, so the first request is already the right size. Nothing is visible
  // in that gap that would not be visible anyway: the placeholder letter renders
  // in its place, exactly as it does for a game with no art.
  const showImage = src && !failed && (slotW > 0 || !HAS_RO)

  function handleError() {
    // First failure on the CDN URL: retry the original IGDB URL. If that also
    // fails (or there was no CDN URL to begin with), show the placeholder.
    if (!rawFallback && shown !== src) setRawFallback(true)
    else setFailed(true)
  }

  return (
    <div className={`cover ${sizeClass} ${className}`.trim()} ref={boxRef}>
      {showImage ? (
        <img src={shown} alt={title || 'Game cover'} loading="lazy" decoding="async" onError={handleError} />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </div>
  )
}
