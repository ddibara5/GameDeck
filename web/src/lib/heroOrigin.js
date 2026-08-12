// Remembers where the user last tapped a game cover, so the detail sheet can
// grow out of that cover instead of sliding in from the bottom edge.
//
// Deliberately implemented as ONE document-level capture-phase listener rather
// than a prop threaded through every card: the sheet is opened from six
// different screens (Library, Discover home, rail pages, Browse results,
// Wishlist, News), and a prop would have to be wired - and kept wired - through
// all of them. Every one of those cards is a <button> containing a <Cover>, so
// the button/cover pair is a reliable anchor to find from the event target.
//
// Resolution order for the origin rect:
//   1. the .cover inside the tapped button (the art itself - what we want)
//   2. the button/link itself (cards without art, e.g. a News row)
//   3. nothing, and the sheet falls back to a plain centred pop
//
// The recorded rect expires quickly so an unrelated earlier tap can never be
// mistaken for the one that opened the sheet.

const MAX_AGE_MS = 1200
const TAPPABLE = 'button, [role="button"], a'

let last = null
let installed = false

function onPointerDown(event) {
  const target = event.target
  if (!target || typeof target.closest !== 'function') {
    last = null
    return
  }
  const tappable = target.closest(TAPPABLE)
  if (!tappable) {
    last = null
    return
  }
  const source = tappable.querySelector('.cover') || tappable
  const r = source.getBoundingClientRect()
  if (!r.width || !r.height) {
    last = null
    return
  }
  last = { x: r.left, y: r.top, w: r.width, h: r.height, ts: Date.now() }
}

export function installHeroOrigin() {
  if (installed || typeof document === 'undefined') return
  installed = true
  // Capture phase so we still see the tap even if the card stops propagation.
  document.addEventListener('pointerdown', onPointerDown, true)
}

// Read-and-clear: an origin is only ever used by the one sheet it opened.
export function takeOrigin() {
  const o = last
  last = null
  if (!o || Date.now() - o.ts > MAX_AGE_MS) return null
  return o
}
