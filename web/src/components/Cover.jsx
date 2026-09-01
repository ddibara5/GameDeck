import { useEffect, useState } from 'react'
import { optImg, optImgSrcSet } from '../lib/format.js'

/**
 * Lazy-loaded game cover image with a walnut placeholder fallback showing
 * the title's initial when the src is missing or fails to load.
 *
 * IGDB art is routed through the wsrv.nl image CDN (resized to the display size
 * and served as WebP) for faster loads. If the CDN ever fails for an image, we
 * fall back to the original IGDB URL, then to the placeholder, so a CDN hiccup
 * never leaves a blank cover.
 */

const WIDTH_LADDER = [96, 128, 160, 192, 224, 256, 320, 384, 448, 512, 640]
const FALLBACK_W = { lg: 480, sm: 224 }

export default function Cover({ src, title, size = 'sm', className = '', priority = false, sizes }) {
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
  const targetW = FALLBACK_W[size] || FALLBACK_W.sm
  const optimized = optImg(src, targetW)
  const shown = rawFallback ? src : optimized
  const srcSet = rawFallback ? '' : optImgSrcSet(src, WIDTH_LADDER)
  const responsiveSizes = sizes || (size === 'lg' ? '(max-width: 600px) 60vw, 240px' : '96px')
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
        <img
          src={shown}
          srcSet={srcSet || undefined}
          sizes={srcSet ? responsiveSizes : undefined}
          width="264"
          height="374"
          alt={title || 'Game cover'}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          onError={handleError}
        />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </div>
  )
}
