// The app ground: a quiet, palette-aware layer behind every tab.
//
// Full-screen game artwork used to be resolved, fetched, sampled, blurred and
// veiled here. Quiet Deck's lists now sit directly on the canvas, so even safe
// artwork competed with the cover thumbnails and titles those lists contain.
// The ground is intentionally CSS-only now: it paints synchronously, follows
// the selected color theme, works offline, and never needs content-specific
// contrast overrides.

const KEY = 'gamedeck_ground_v1'

const SOURCES = new Set(['off', 'wash', 'glow', 'horizon'])
const LEGACY_ART = new Set(['nowplaying', 'weekly', 'pinned', 'shuffle'])
const LEGACY_KEYS = [
  'gamedeck_ground_pin_v1',
  'gamedeck_ground_intensity_v1',
  'gamedeck_ground_paint_v1',
  'gamedeck_accent_art_v1',
]

export const GROUND_OPTIONS = [
  { key: 'off', label: 'Flat', sub: 'The cleanest, simplest canvas' },
  { key: 'wash', label: 'Soft wash', sub: 'A quiet bloom in your selected color' },
  { key: 'glow', label: 'Ambient glow', sub: 'Two diffused pools of muted color' },
  { key: 'horizon', label: 'Horizon', sub: 'A gentle top-to-bottom color shift' },
]

const root = () => document.documentElement

function normalize(value) {
  if (LEGACY_ART.has(value)) return 'wash'
  return SOURCES.has(value) ? value : 'off'
}

function clearLegacyState() {
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key)
  } catch {
    /* storage unavailable - the current session still paints correctly */
  }

  // Clear inline values left by the retired artwork implementation. This also
  // makes a service-worker update safe without requiring the installed PWA to
  // be fully closed before the new CSS can take over.
  const el = root()
  el.removeAttribute('data-ground-art')
  el.removeAttribute('data-accent-art')
  for (const property of [
    '--ground-src',
    '--ground-veil-a',
    '--accent',
    '--amber',
    '--logo-1',
    '--logo-2',
    '--logo-3',
    '--logo-4',
    '--logo-5',
    '--logo-6',
    '--logo-7',
  ]) {
    el.style.removeProperty(property)
  }
}

export function getGround() {
  try {
    const stored = localStorage.getItem(KEY)
    const value = normalize(stored)
    if (stored !== value) localStorage.setItem(KEY, value)
    clearLegacyState()
    return value
  } catch {
    return 'off'
  }
}

export function applyGround(value) {
  const next = normalize(value)
  clearLegacyState()
  root().setAttribute('data-ground', next)
  return next
}

export function setGround(value) {
  const next = normalize(value)
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* storage unavailable - the preference just will not persist */
  }
  applyGround(next)
  return next
}

export function initGround() {
  applyGround(getGround())
}
