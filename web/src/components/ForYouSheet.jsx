import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useDialogA11y } from '../lib/useDialogA11y.js'
import { useDelayedClose } from '../lib/useDelayedClose.js'
import { lockScroll } from '../lib/scrollLock.js'
import './forYou.css'

// Modal page sheet for the For You surfaces ("Why this pick", "Tune your
// mix"), ported from the pilot's for-you-sheet.tsx. Reuses the app's
// modal-backdrop / modal-sheet styling and the dialog focus trap (which also
// handles Escape).
export default function ForYouSheet({
  title,
  onClose,
  busy = false,
  compact = false,
  children,
}) {
  const { closing, requestClose } = useDelayedClose(onClose)
  const dialogRef = useDialogA11y({ active: true, onClose: busy || closing ? null : requestClose })
  useEffect(() => lockScroll(), [])

  // Page transitions create containing blocks for fixed descendants. Keep all
  // For You sheets at the viewport level, like the shared game detail page.
  return createPortal(
    <div
      className={`modal-backdrop${closing ? ' closing' : ''}`}
      onClick={(event) => {
        if (!busy && !closing && event.target === event.currentTarget) requestClose()
      }}
    >
      <div
        ref={dialogRef}
        className={`modal-sheet filter-sheet fy-sheet${compact ? ' compact' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-handle" />
        <div className="filter-sheet-head fy-sheet-head">
          <div className="detail-title">{title}</div>
          <button
            type="button"
            className="fy-sheet-done"
            onClick={requestClose}
            disabled={busy || closing}
          >
            Done
          </button>
        </div>
        <div className="filter-sheet-scroll fy-sheet-scroll">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
