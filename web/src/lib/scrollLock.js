// Reference-counted document scroll lock.
//
// Several overlays (side menu, game sheet, settings, customize, the full-screen
// Wishlist / status views) each want to freeze the page behind them. The old
// approach had every component capture `document.body.style.overflow` on open and
// restore that captured value on close. When two locks overlapped, the second one
// captured 'hidden' (set by the first) as its "previous" value and restored
// 'hidden' on close, leaving the body permanently unscrollable. That is exactly
// what happened opening the Wishlist from the still-open menu: closing the
// Wishlist restored 'hidden' and every tab, including Discover, stopped scrolling.
//
// A single shared counter keeps the document locked until the last owner releases.
// Lock the root, not body: index.css gives html overflow-x: clip, so body overflow
// no longer propagates to the viewport. Hiding overflow on the 100%-height body
// creates a separate clipping box. On iOS standalone this leaves a stationary
// bottom strip and raises the dock until the last overlay unmounts. Root overflow
// applies to the viewport without turning body into a clipped scroll container.

let count = 0
let saved = null

// Acquire a lock and return a release function (safe to use directly as a React
// effect cleanup: `useEffect(() => lockScroll(), [])`). Each call must release
// exactly once; the returned function is idempotent.
export function lockScroll() {
  if (typeof document === 'undefined') return () => {}
  if (count === 0) {
    const style = document.documentElement.style
    saved = ['overflow-x', 'overflow-y'].map((name) => [
      name, style.getPropertyValue(name), style.getPropertyPriority(name),
    ])
    style.setProperty('overflow', 'hidden')
  }
  count += 1
  let released = false
  return () => {
    if (released) return
    released = true
    count -= 1
    if (count <= 0) {
      count = 0
      const style = document.documentElement.style
      for (const [name, value, priority] of saved) {
        if (value) style.setProperty(name, value, priority)
        else style.removeProperty(name)
      }
      saved = null
    }
  }
}
