import { useEffect, useState } from 'react'
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
export default function Cover({ src, title, size = 'sm', className = '' }) {
  const [failed, setFailed] = useState(false)
  const [rawFallback, setRawFallback] = useState(false)

  // Reset the load state whenever the source changes (e.g. the sheet cover
  // swaps in richer art once its IGDB media resolves).
  useEffect(() => {
    setFailed(false)
    setRawFallback(false)
  }, [src])

  const initial = (title || '?').trim().charAt(0).toUpperCase() || '?'
  const sizeClass = size === 'lg' ? 'cover-lg' : 'cover-sm'

  // 2x the CSS slot so retina stays sharp; optImg caps this at the source width.
  const targetW = size === 'lg' ? 480 : 224
  const optimized = optImg(src, targetW)
  const shown = rawFallback ? src : optimized
  const showImage = src && !failed

  function handleError() {
    // First failure on the CDN URL: retry the original IGDB URL. If that also
    // fails (or there was no CDN URL to begin with), show the placeholder.
    if (!rawFallback && shown !== src) setRawFallback(true)
    else setFailed(true)
  }

  return (
    <div className={`cover ${sizeClass} ${className}`.trim()}>
      {showImage ? (
        <img src={shown} alt={title || 'Game cover'} loading="lazy" decoding="async" onError={handleError} />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </div>
  )
}
