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
