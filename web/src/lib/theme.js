// Theme preference controller. Stores the user's choice ('dark' | 'light' |
// 'system') and applies the resolved theme by setting data-theme on <html>.
// The actual colors live in index.css under :root and :root[data-theme="light"].

const KEY = 'gamedeck_theme_v1'
const VALID = new Set(['dark', 'light', 'system'])

// Color theme (accent + tuned neutrals), independent of light/dark. Applied by
// setting data-accent on <html>; palettes live in index.css. Walnut is default.
const ACCENT_KEY = 'gamedeck_accent_v1'
const ACCENTS = new Set(['walnut', 'slate', 'sage', 'plum', 'graphite'])

// In-app brand treatment. This is intentionally separate from the installed
// PWA icon, which iOS caches and cannot switch reliably at runtime.
const LOGO_STYLE_KEY = 'gamedeck_logo_style_v1'
const LOGO_STYLES = new Set(['classic', 'glass'])

export function getLogoStyle() {
  try {
    const value = localStorage.getItem(LOGO_STYLE_KEY)
    return LOGO_STYLES.has(value) ? value : 'classic'
  } catch {
    return 'classic'
  }
}

export function applyLogoStyle(value) {
  const next = LOGO_STYLES.has(value) ? value : 'classic'
  document.documentElement.setAttribute('data-logo-style', next)
  return next
}

export function setLogoStyle(value) {
  const next = LOGO_STYLES.has(value) ? value : 'classic'
  try {
    localStorage.setItem(LOGO_STYLE_KEY, next)
  } catch {
    /* storage unavailable - preference just won't persist */
  }
  applyLogoStyle(next)
  return next
}

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

// One artwork scale for every repeatable game-card surface. The two preferences
// this replaces split horizontal shelves from list rows, which is why changing
// Settings only affected part of the app. A single data-artwork attribute now
// drives the semantic cover tokens in cardSize.css.
//
// The legacy keys are read only when the new preference does not exist. Taking
// the larger of the two preserves the user's most spacious existing choice and
// avoids shrinking one of their views during migration.
const ARTWORK_KEY = 'gamedeck_artwork_size_v1'
const SHELF_KEY = 'gamedeck_shelf_size_v1'
const LIST_KEY = 'gamedeck_list_size_v1'
const ARTWORK_SIZES = new Set(['s', 'm', 'l'])
const SHELF_RANK = { s: 0, m: 1, l: 2 }
const LIST_RANK = { compact: 0, comfortable: 1, large: 2 }
const SIZE_BY_RANK = ['s', 'm', 'l']

export function getArtworkSize() {
  try {
    const saved = localStorage.getItem(ARTWORK_KEY)
    if (ARTWORK_SIZES.has(saved)) return saved

    const shelf = localStorage.getItem(SHELF_KEY)
    const list = localStorage.getItem(LIST_KEY)
    const migrated = SIZE_BY_RANK[Math.max(SHELF_RANK[shelf] ?? 1, LIST_RANK[list] ?? 1)]
    localStorage.setItem(ARTWORK_KEY, migrated)
    return migrated
  } catch {
    return 'm'
  }
}

export function applyArtworkSize(v) {
  const size = ARTWORK_SIZES.has(v) ? v : 'm'
  document.documentElement.setAttribute('data-artwork', size)
  return size
}

export function setArtworkSize(v) {
  const size = ARTWORK_SIZES.has(v) ? v : 'm'
  try {
    localStorage.setItem(ARTWORK_KEY, size)
  } catch {
    /* storage unavailable - preference just won't persist */
  }
  return applyArtworkSize(size)
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
  applyLogoStyle(getLogoStyle())
  applyArtworkSize(getArtworkSize())
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
