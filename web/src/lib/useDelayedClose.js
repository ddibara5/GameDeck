import { useEffect, useRef, useState } from 'react'

// For modal sheets that unmount instantly: call requestClose() to play an exit
// animation first (via the returned `closing` flag) and fire onClose after `ms`.
export function useDelayedClose(onClose, ms = 240) {
  const [closing, setClosing] = useState(false)
  const timer = useRef(null)

  function requestClose() {
    if (timer.current) return
    setClosing(true)
    timer.current = setTimeout(() => {
      onClose()
    }, ms)
  }

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  return { closing, requestClose }
}
