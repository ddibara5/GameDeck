import { useState } from 'react'
import { coverImageProps, getLoadedCover, rememberCover } from '../lib/coverLoading.js'

/**
 * Lazy-loaded game cover image with a walnut placeholder fallback showing
 * the title's initial when the src is missing or fails to load.
 *
 * IGDB art is routed through the wsrv.nl image CDN (resized to the display size
 * and served as WebP) for faster loads. If the CDN ever fails for an image, we
 * fall back to the original IGDB URL, then to the placeholder, so a CDN hiccup
 * never leaves a blank cover.
 */

export default function Cover(props) {
  // Reset errors on a source change without first requesting the old fallback.
  return <CoverImage key={props.src || ''} {...props} />
}

function CoverImage({ src, title, size = 'sm', className = '', priority = false, sizes }) {
  const cached = getLoadedCover(src)
  const [failed, setFailed] = useState(false)
  const [rawFallback, setRawFallback] = useState(() => cached?.rawFallback || false)

  const initial = (title || '?').trim().charAt(0).toUpperCase() || '?'
  const sizeClass = size === 'lg' ? 'cover-lg' : 'cover-sm'
  const imageProps = coverImageProps(src, size, sizes, rawFallback)
  const showImage = src && !failed

  function handleError() {
    // First failure on the CDN URL: retry the original IGDB URL. If that also
    // fails (or there was no CDN URL to begin with), show the placeholder.
    if (!rawFallback && imageProps.src !== src) setRawFallback(true)
    else setFailed(true)
  }

  return (
    <div className={`cover ${sizeClass} ${className}`.trim()}>
      {showImage ? (
        <img
          src={imageProps.src}
          srcSet={imageProps.srcSet}
          sizes={imageProps.sizes}
          width="264"
          height="374"
          alt={title || 'Game cover'}
          loading={priority || cached ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding={cached ? 'sync' : 'async'}
          onLoad={() => rememberCover(src, rawFallback)}
          onError={handleError}
        />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </div>
  )
}
