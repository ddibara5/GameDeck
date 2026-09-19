import { useDialogA11y } from '../lib/useDialogA11y.js'
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
  const dialogRef = useDialogA11y({ active: true, onClose: busy ? null : onClose })

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) onClose()
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
            onClick={onClose}
            disabled={busy}
          >
            Done
          </button>
        </div>
        <div className="filter-sheet-scroll fy-sheet-scroll">{children}</div>
      </div>
    </div>
  )
}
