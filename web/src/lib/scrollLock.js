// Reference-counted body scroll lock.
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
// A single shared counter avoids the whole class of bug: the body is locked while
// one or more owners hold a lock, and the original overflow is restored only when
// the last owner releases.

let count = 0
let saved = ''

// Acquire a lock and return a release function (safe to use directly as a React
// effect cleanup: `useEffect(() => lockScroll(), [])`). Each call must release
// exactly once; the returned function is idempotent.
export function lockScroll() {
  if (typeof document === 'undefined') return () => {}
  if (count === 0) {
    saved = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  count += 1
  let released = false
  return () => {
    if (released) return
    released = true
    count -= 1
    if (count <= 0) {
      count = 0
      document.body.style.overflow = saved
      saved = ''
    }
  }
}
