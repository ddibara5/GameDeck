// GameDeck appearance preferences. A visual theme owns the whole art direction
// while light/dark and accessibility preferences remain user controls.

const MODE_KEY = 'gamedeck_theme_v1'
const FAMILY_KEY = 'gamedeck_visual_theme_v2'
const LEGACY_ACCENT_KEY = 'gamedeck_accent_v1'
const LOGO_STYLE_KEY = 'gamedeck_logo_style_v1'
const MOTION_KEY = 'gamedeck_motion_v1'
const CONTRAST_KEY = 'gamedeck_contrast_v1'
const TRANSPARENCY_KEY = 'gamedeck_transparency_v1'

const MODES = new Set(['dark', 'light', 'system'])
const FAMILIES = new Set(['curator', 'obsidian', 'xbox', 'playstation', 'neon', 'blueprint', 'cartridge'])
const LOGO_STYLES = new Set(['theme', 'classic', 'glass'])
const DISPLAY_VALUES = new Set(['system', 'standard', 'reduced'])
const CONTRAST_VALUES = new Set(['system', 'standard', 'high'])

const LEGACY_FAMILY_MAP = {
  walnut: 'curator',
  slate: 'obsidian',
  graphite: 'obsidian',
  sage: 'blueprint',
  plum: 'neon',
}

const RETIRED_GROUND_KEYS = [
  'gamedeck_ground_v1',
  'gamedeck_ground_pin_v1',
  'gamedeck_ground_intensity_v1',
  'gamedeck_ground_paint_v1',
  'gamedeck_accent_art_v1',
]

export const THEME_FAMILIES = [
  {
    key: 'curator', label: 'Curator', eyebrow: 'Editorial archive',
    description: 'Warm paper, walnut details, bookish type and restrained movement.',
    dark: ['#18130e', '#251d16', '#d8aa62'], light: ['#f1e8d8', '#fbf6ed', '#8a5d25'],
  },
  {
    key: 'obsidian', label: 'Obsidian Glass', eyebrow: 'Premium cinematic',
    description: 'Prismatic glass, soft depth and deliberate gallery-like pacing.',
    dark: ['#0a0b0f', '#171923', '#82a3ff'], light: ['#edf1f8', '#f9fbff', '#3f61bd'],
  },
  {
    key: 'xbox', label: 'Xbox', eyebrow: 'Velocity dashboard',
    description: 'Graphite tiles, directional green rails and achievement-inspired energy.',
    dark: ['#070a08', '#121714', '#69c350'], light: ['#eef3ee', '#fbfdfb', '#107c10'],
  },
  {
    key: 'playstation', label: 'PlayStation', eyebrow: 'Midnight wave',
    description: 'Cobalt atmosphere, floating glass layers and cinematic spotlight motion.',
    dark: ['#050b18', '#0c1830', '#64a9ff'], light: ['#edf4fb', '#fbfdff', '#0068bd'],
  },
  {
    key: 'neon', label: 'Neon Cabinet', eyebrow: 'Arcade energy',
    description: 'Electric cyan and magenta, crisp corners and responsive snap.',
    dark: ['#080b12', '#111725', '#00e6c7'], light: ['#eef2f3', '#fbfdfe', '#00756e'],
  },
  {
    key: 'blueprint', label: 'Blueprint', eyebrow: 'Analytical studio',
    description: 'Technical grid, precise metrics and calm information density.',
    dark: ['#07182c', '#0d2742', '#5cc8ff'], light: ['#e7f1f7', '#f7fbfe', '#12678e'],
  },
  {
    key: 'cartridge', label: 'Cartridge', eyebrow: 'Tactile retro',
    description: 'Printed labels, hard shadows, warm plastic and pixel-era wit.',
    dark: ['#1c1a16', '#29251e', '#ff7542'], light: ['#e9e1c8', '#f8f2df', '#aa3516'],
  },
]

function read(key) {
  try { return localStorage.getItem(key) } catch { return null }
}

function write(key, value) {
  try { localStorage.setItem(key, value) } catch { /* session-only preference */ }
}

function remove(key) {
  try { localStorage.removeItem(key) } catch { /* storage unavailable */ }
}

const root = () => document.documentElement

function cleanupRetiredAppearance() {
  RETIRED_GROUND_KEYS.forEach(remove)
  if (typeof document === 'undefined') return
  const el = root()
  for (const attr of ['data-accent', 'data-ground', 'data-ground-art', 'data-accent-art']) el.removeAttribute(attr)
  for (const property of ['--ground-src', '--ground-veil-a']) el.style.removeProperty(property)
}

function updateThemeColor() {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return
  const meta = document.querySelector('meta[name="theme-color"]')
  const color = getComputedStyle(root()).getPropertyValue('--bg').trim()
  if (meta && color) meta.setAttribute('content', color)
}

export function getTheme() {
  const value = read(MODE_KEY)
  return MODES.has(value) ? value : 'dark'
}

export function resolveTheme(pref) {
  const value = pref || getTheme()
  if (value === 'system') return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  return value === 'light' ? 'light' : 'dark'
}

export function applyTheme(pref) {
  root().setAttribute('data-theme', resolveTheme(pref))
  updateThemeColor()
}

export function setTheme(pref) {
  const next = MODES.has(pref) ? pref : 'dark'
  write(MODE_KEY, next)
  applyTheme(next)
  return next
}

export function getThemeFamily() {
  const saved = read(FAMILY_KEY)
  if (FAMILIES.has(saved)) return saved
  const migrated = LEGACY_FAMILY_MAP[read(LEGACY_ACCENT_KEY)] || 'curator'
  write(FAMILY_KEY, migrated)
  remove(LEGACY_ACCENT_KEY)
  return migrated
}

export function applyThemeFamily(value) {
  const next = FAMILIES.has(value) ? value : 'curator'
  cleanupRetiredAppearance()
  root().setAttribute('data-theme-family', next)
  updateThemeColor()
  return next
}

export function setThemeFamily(value) {
  const next = FAMILIES.has(value) ? value : 'curator'
  write(FAMILY_KEY, next)
  return applyThemeFamily(next)
}

export function getLogoStyle() {
  const value = read(LOGO_STYLE_KEY)
  return LOGO_STYLES.has(value) ? value : 'theme'
}

export function applyLogoStyle(value) {
  const next = LOGO_STYLES.has(value) ? value : 'theme'
  root().setAttribute('data-logo-style', next)
  return next
}

export function setLogoStyle(value) {
  const next = LOGO_STYLES.has(value) ? value : 'theme'
  write(LOGO_STYLE_KEY, next)
  return applyLogoStyle(next)
}

function getPreference(key, allowed, fallback = 'system') {
  const value = read(key)
  return allowed.has(value) ? value : fallback
}

function setPreference(key, attribute, allowed, value, fallback = 'system') {
  const next = allowed.has(value) ? value : fallback
  write(key, next)
  root().setAttribute(attribute, next)
  return next
}

export const getMotion = () => getPreference(MOTION_KEY, DISPLAY_VALUES)
export const setMotion = (value) => setPreference(MOTION_KEY, 'data-motion', DISPLAY_VALUES, value)
export const getContrast = () => getPreference(CONTRAST_KEY, CONTRAST_VALUES)
export const setContrast = (value) => setPreference(CONTRAST_KEY, 'data-contrast', CONTRAST_VALUES, value)
export const getTransparency = () => getPreference(TRANSPARENCY_KEY, DISPLAY_VALUES)
export const setTransparency = (value) => setPreference(TRANSPARENCY_KEY, 'data-transparency', DISPLAY_VALUES, value)

const ARTWORK_KEY = 'gamedeck_artwork_size_v1'
const SHELF_KEY = 'gamedeck_shelf_size_v1'
const LIST_KEY = 'gamedeck_list_size_v1'
const ARTWORK_SIZES = new Set(['s', 'm', 'l'])
const SHELF_RANK = { s: 0, m: 1, l: 2 }
const LIST_RANK = { compact: 0, comfortable: 1, large: 2 }
const SIZE_BY_RANK = ['s', 'm', 'l']

export function getArtworkSize() {
  const saved = read(ARTWORK_KEY)
  if (ARTWORK_SIZES.has(saved)) return saved
  const migrated = SIZE_BY_RANK[Math.max(SHELF_RANK[read(SHELF_KEY)] ?? 1, LIST_RANK[read(LIST_KEY)] ?? 1)]
  write(ARTWORK_KEY, migrated)
  return migrated
}

export function applyArtworkSize(value) {
  const next = ARTWORK_SIZES.has(value) ? value : 'm'
  root().setAttribute('data-artwork', next)
  return next
}

export function setArtworkSize(value) {
  const next = ARTWORK_SIZES.has(value) ? value : 'm'
  write(ARTWORK_KEY, next)
  return applyArtworkSize(next)
}

export function initTheme() {
  applyTheme(getTheme())
  applyThemeFamily(getThemeFamily())
  applyLogoStyle(getLogoStyle())
  applyArtworkSize(getArtworkSize())
  root().setAttribute('data-motion', getMotion())
  root().setAttribute('data-contrast', getContrast())
  root().setAttribute('data-transparency', getTransparency())

  try {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => { if (getTheme() === 'system') applyTheme('system') }
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else if (mq.addListener) mq.addListener(onChange)
  } catch { /* System simply keeps its startup resolution */ }
}
