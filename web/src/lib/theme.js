// Theme preference controller. Stores the user's choice ('dark' | 'light' |
// 'system') and applies the resolved theme by setting data-theme on <html>.
// The actual colors live in index.css under :root and :root[data-theme="light"].

const KEY = 'gamedeck_theme_v1'
const VALID = new Set(['dark', 'light', 'system'])

// Color theme (accent + tuned neutrals), independent of light/dark. Applied by
// setting data-accent on <html>; palettes live in index.css. Walnut is default.
const ACCENT_KEY = 'gamedeck_accent_v1'
const ACCENTS = new Set(['walnut', 'slate', 'sage', 'plum', 'graphite'])

export function getAccent() {
  try {
    const v = localStorage.getItem(ACCENT_KEY)
    return ACCENTS.has(v) ? v : 'walnut'
  } catch {
    return 'walnut'
  }
}

export function applyAccent(name) {
  const a = ACCENTS.has(name) ? name : 'walnut'
  document.documentElement.setAttribute('data-accent', a)
}

export function setAccent(name) {
  const a = ACCENTS.has(name) ? name : 'walnut'
  try {
    localStorage.setItem(ACCENT_KEY, a)
  } catch {
    /* storage unavailable - preference just won't persist */
  }
  applyAccent(a)
  return a
}

// The app ground: what the page itself is painted with behind every card.
//
// 'glow' is a soft wash of the current accent in the top-left gutter, above the
// first card and beside the header. 'none' is the flat colour the app shipped
// with, and it stays a real option rather than an absence: a ground you cannot
// turn off is a redesign, not a setting.
//
// Applied via data-ground on <html>, exactly like data-accent, so the gradient
// lives in index.css and is written in `--glow-rgb`, which every colour theme
// declares for itself. Picking Slate recolours the ground for free.
const GROUND_KEY = 'gamedeck_ground_v1'
const GROUNDS = new Set(['glow', 'none'])

export function getGround() {
  try {
    const v = localStorage.getItem(GROUND_KEY)
    return GROUNDS.has(v) ? v : 'glow'
  } catch {
    return 'glow'
  }
}

export function applyGround(name) {
  document.documentElement.setAttribute('data-ground', GROUNDS.has(name) ? name : 'glow')
}

export function setGround(name) {
  const g = GROUNDS.has(name) ? name : 'glow'
  try {
    localStorage.setItem(GROUND_KEY, g)
  } catch {
    /* storage unavailable - preference just won't persist */
  }
  applyGround(g)
  return g
}

// Card sizing. Shelf = poster width on every horizontal rail (Continue Playing,
// Discover shelves, wishlist, Game Pass). List = Library / Discover list-row
// thumbnail + title. Applied via data-shelf / data-list on <html>; the actual
// scales live in index.css. Defaults: shelf 'm' (medium), list 'comfortable'.
const SHELF_KEY = 'gamedeck_shelf_size_v1'
const LIST_KEY = 'gamedeck_list_size_v1'
const SHELF_SIZES = new Set(['s', 'm', 'l'])
const LIST_SIZES = new Set(['compact', 'comfortable', 'large'])

export function getShelfSize() {
  try {
    const v = localStorage.getItem(SHELF_KEY)
    return SHELF_SIZES.has(v) ? v : 'm'
  } catch {
    return 'm'
  }
}

export function applyShelfSize(v) {
  document.documentElement.setAttribute('data-shelf', SHELF_SIZES.has(v) ? v : 'm')
}

export function setShelfSize(v) {
  const s = SHELF_SIZES.has(v) ? v : 'm'
  try {
    localStorage.setItem(SHELF_KEY, s)
  } catch {
    /* storage unavailable - preference just won't persist */
  }
  applyShelfSize(s)
  return s
}

export function getListSize() {
  try {
    const v = localStorage.getItem(LIST_KEY)
    return LIST_SIZES.has(v) ? v : 'comfortable'
  } catch {
    return 'comfortable'
  }
}

export function applyListSize(v) {
  document.documentElement.setAttribute('data-list', LIST_SIZES.has(v) ? v : 'comfortable')
}

export function setListSize(v) {
  const s = LIST_SIZES.has(v) ? v : 'comfortable'
  try {
    localStorage.setItem(LIST_KEY, s)
  } catch {
    /* storage unavailable - preference just won't persist */
  }
  applyListSize(s)
  return s
}

export function getTheme() {
  try {
    const v = localStorage.getItem(KEY)
    return VALID.has(v) ? v : 'dark'
  } catch {
    return 'dark'
  }
}

// Resolve a preference to a concrete theme ('dark' | 'light').
export function resolveTheme(pref) {
  const p = pref || getTheme()
  if (p === 'system') {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }
  return p === 'light' ? 'light' : 'dark'
}

export function applyTheme(pref) {
  document.documentElement.setAttribute('data-theme', resolveTheme(pref))
}

export function setTheme(pref) {
  const p = VALID.has(pref) ? pref : 'dark'
  try {
    localStorage.setItem(KEY, p)
  } catch {
    /* storage unavailable - preference just won't persist */
  }
  applyTheme(p)
  return p
}

// Apply on startup and keep 'system' in sync with OS appearance changes.
export function initTheme() {
  applyTheme(getTheme())
  applyAccent(getAccent())
  applyGround(getGround())
  applyShelfSize(getShelfSize())
  applyListSize(getListSize())
  try {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => {
      if (getTheme() === 'system') applyTheme('system')
    }
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else if (mq.addListener) mq.addListener(onChange)
  } catch {
    /* matchMedia unavailable - system option just won't live-update */
  }
}
