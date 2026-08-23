// Fetch the code for tabs the user has not opened yet, while nothing is happening.
//
// WHY THIS IS NOT FREE, AND WHY IT IS STILL WORTH IT
//
// Every tab is its own chunk, and sw.js cache-firsts /assets/*, so the SECOND
// visit to a tab is instant and always has been. The cost is the first one:
// after an install, or after any deploy that renamed a chunk, the first tap on
// Discover is a network round trip before a single pixel of it exists. Measured
// on the built app: Discover 34.9kB, Insights 14.9, Home 14.3, News 12.8,
// Wishlist 10.3, Library 6.4, Activity 4.0 - about 30kB gzipped for every tab in
// the bar that is not the one you landed on.
//
// So it is 30kB of bandwidth spent to remove a round trip from six taps. Three
// rules keep that trade honest:
//
//   1. ONLY THE TABS IN THE BAR. A tab hidden from the bar is one the user
//      deliberately does not use, and warming it is pure waste.
//   2. AFTER THE PAGE HAS LOADED, and then only on idle. The launch already
//      makes nine Supabase calls; a prefetch that races them makes the thing it
//      is trying to speed up slower.
//   3. ONE AT A TIME. Six parallel requests on a phone is six requests
//      competing for the same connection, which is the same mistake as (2) in a
//      different costume.
//
// And it does nothing at all on a metered or slow connection, which is the one
// case where "spend bandwidth to save time" is the wrong trade.

const onIdle = (fn) =>
  typeof requestIdleCallback === 'function'
    ? requestIdleCallback(fn, { timeout: 2000 })
    : setTimeout(fn, 250)

const cancelIdle = (h) =>
  typeof cancelIdleCallback === 'function' ? cancelIdleCallback(h) : clearTimeout(h)

// saveData is the user asking outright. `2g` / `slow-2g` is the browser saying a
// 30kB speculative download would cost more than the tap it saves.
function shouldWarm() {
  const c = typeof navigator !== 'undefined' ? navigator.connection : null
  if (!c) return true
  if (c.saveData) return false
  return !/(^|-)2g$/.test(String(c.effectiveType || ''))
}

const afterLoad = (fn) => {
  if (typeof document === 'undefined') return () => {}
  if (document.readyState === 'complete') {
    fn()
    return () => {}
  }
  window.addEventListener('load', fn, { once: true })
  return () => window.removeEventListener('load', fn)
}

/**
 * Run `loaders` one at a time on idle, starting once the page has finished
 * loading. Returns a cancel function; anything not started yet is dropped.
 *
 * A loader is the SAME `() => import('...')` the lazy component was built from,
 * deliberately: a prefetch written against a second copy of the specifier warms a
 * chunk the renderer does not then use, and nothing about the result would say so.
 */
export function warmOnIdle(loaders) {
  const queue = loaders.filter(Boolean)
  if (!queue.length || !shouldWarm()) return () => {}

  let cancelled = false
  let handle = null
  let i = 0

  const step = () => {
    if (cancelled || i >= queue.length) return
    const next = queue[i++]
    Promise.resolve()
      .then(next)
      .catch(() => {
        /* an offline prefetch is a no-op, not an error: the tap still works */
      })
      .then(() => {
        if (!cancelled) handle = onIdle(step)
      })
  }

  const stopWaiting = afterLoad(() => {
    if (!cancelled) handle = onIdle(step)
  })

  return () => {
    cancelled = true
    stopWaiting()
    if (handle != null) cancelIdle(handle)
  }
}
