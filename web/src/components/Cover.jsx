import { useState } from 'react'

/**
 * Lazy-loaded game cover image with a walnut placeholder fallback showing
 * the title's initial when the src is missing or fails to load.
 */
export default function Cover({ src, title, size = 'sm', className = '' }) {
  const [failed, setFailed] = useState(false)
  const initial = (title || '?').trim().charAt(0).toUpperCase() || '?'
  const sizeClass = size === 'lg' ? 'cover-lg' : 'cover-sm'

  const showImage = src && !failed

  return (
    <div className={`cover ${sizeClass} ${className}`.trim()}>
      {showImage ? (
        <img src={src} alt={title || 'Game cover'} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </div>
  )
}
