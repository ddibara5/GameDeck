import { useEffect, useRef, useState } from 'react'

// Keeps a component mounted through its exit animation. Returns `mounted`
// (whether to render at all) and `closing` (apply the exit-animation class).
// When `open` flips false, `closing` turns on for `exitMs` so the exit
// animation can play, then the component unmounts.
export function useMountTransition(open, exitMs = 220) {
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    if (open) {
      // (Re)opening: cancel any pending unmount and show immediately.
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
      setMounted(true)
      setClosing(false)
    } else if (mounted) {
      // Closing: play the exit animation, then unmount.
      setClosing(true)
      timer.current = setTimeout(() => {
        setMounted(false)
        setClosing(false)
        timer.current = null
      }, exitMs)
    }
    return () => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
    }
  }, [open, exitMs]) // eslint-disable-line react-hooks/exhaustive-deps

  return { mounted, closing }
}
