import { useRef, useState } from 'react'

// Swipe-down-to-dismiss for a bottom sheet.
//
// Lifted verbatim out of GameSheet, which had been the only sheet in the app you
// could swipe away. Every other sheet unmounted only via its close button or the
// backdrop, which reads as broken on a phone: a sheet that slides up is expected
// to slide back down. One definition rather than a second copy, for the same
// reason `useLibraryGames` and `filter-sheet` are single definitions - a
// duplicated interaction drifts, and then two sheets in one app feel different.
//
// Attach `handlers` to a zone that contains NO scrollable content and no
// controls: the move handler calls preventDefault, so a drag zone over the body
// would eat the sheet's own scroll. The grabber and the title block are the
// usual targets. That zone also needs `touch-action: none` in CSS, or iOS claims
// the gesture before React sees it.
//
// `onDismiss` should be the delayed-close request, not the raw onClose, so the
// exit animation still plays.
export function useSheetDrag(onDismiss, threshold = 110) {
  const drag = useRef({ startY: 0, active: false })
  const [dragY, setDragY] = useState(0)

  const handlers = {
    onTouchStart(e) {
      drag.current = { startY: e.touches[0].clientY, active: true }
    },
    onTouchMove(e) {
      if (!drag.current.active) return
      const dy = e.touches[0].clientY - drag.current.startY
      // Downward only. Dragging up past the top edge would detach the sheet from
      // the bottom of the screen with nothing behind it.
      if (dy > 0) {
        setDragY(dy)
        if (e.cancelable) e.preventDefault()
      } else {
        setDragY(0)
      }
    },
    onTouchEnd() {
      const shouldClose = dragY > threshold
      drag.current.active = false
      if (shouldClose) onDismiss()
      else setDragY(0)
    },
  }

  // `dragging` is read from the ref rather than state on purpose: it decides
  // whether the transform animates, and it has to be correct on the SAME render
  // that applies a new dragY. A state flag would lag one frame and the sheet
  // would visibly rubber-band behind the finger.
  return { dragY, dragging: drag.current.active, handlers }
}
