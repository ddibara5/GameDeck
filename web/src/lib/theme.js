// Theme preference controller. Stores the user's choice ('dark' | 'light' |
// 'system') and applies the resolved theme by setting data-theme on <html>.
// The actual colors live in index.css under :root and :root[data-theme="light"].

const KEY = 'gamedeck_theme_v1'
const VALID = new Set(['dark', 'light', 'system'])

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
