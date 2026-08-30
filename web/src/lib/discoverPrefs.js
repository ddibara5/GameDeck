// Standing Discover preferences: the narrowing you want EVERY time, as distinct
// from the filter sheet, which you set for one look around and then clear.
//
// This module exists because the friction was never a missing filter. Discover
// already had a hide-owned toggle and a platform picker. Both were component
// state, both reset on every mount, so the same two choices had to be made again
// on every visit. Measured 21 Aug 2026 against the live rails: 29 of the 80
// cards across the four default shelves were games already owned or already
// wishlisted, and all nine off-hardware titles on "Recently released" were
// PC-only.
//
// Platforms is a SET, not a choice, which is why `platform` on /api/discover now
// takes a comma-separated list. Xbox and PlayStation are the default pair.
//
// PC is deliberately NOT in the default. Every one of those nine off-hardware
// titles (Vholume, Lord of Mysteries, Dwarrf, Mine Defense, Vacation Cafe
// Simulator, Brigador Killers, Project P.I.T.T., Entropy, Stars Reach) passes a
// PC filter, so including it by default readmits the entire set and undoes the
// narrowing in one slug. The cost is real and accepted: Satisfactory, Dinoblade
// and Enshrouded were all PC-first here, so PC-only releases do not surface
// until the chip is on. That is a tap, not a cleverer default.
import { useEffect, useState } from 'react'

const KEY = 'gamedeck_discover_prefs_v1'
const EVENT = 'gd-discover-prefs-change'

// Slugs must match the PLATFORMS map in api/discover.js.
export const PLATFORM_CHOICES = [
  { key: 'xbox', label: 'Xbox' },
  { key: 'psn', label: 'PlayStation' },
  { key: 'switch', label: 'Switch' },
  { key: 'steam', label: 'PC' },
]

const CHOICE_KEYS = PLATFORM_CHOICES.map((p) => p.key)

const DEFAULTS = { platforms: ['xbox', 'psn'], hideOwned: true }

function load() {
  let stored = null
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    stored = null
  }
  if (!stored) return { ...DEFAULTS, platforms: [...DEFAULTS.platforms] }
  // Reconcile against the catalog so a slug that no longer exists drops out
  // rather than being sent to IGDB forever.
  const platforms = Array.isArray(stored.platforms)
    ? stored.platforms.filter((k) => CHOICE_KEYS.includes(k))
    : [...DEFAULTS.platforms]
  return {
    platforms,
    hideOwned: 'hideOwned' in stored ? Boolean(stored.hideOwned) : DEFAULTS.hideOwned,
  }
}

export function getDiscoverPrefs() {
  return load()
}

export function setDiscoverPrefs(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ platforms: next.platforms, hideOwned: next.hideOwned }))
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT))
}

export function resetDiscoverPrefs() {
  setDiscoverPrefs({ ...DEFAULTS, platforms: [...DEFAULTS.platforms] })
}

export function useDiscoverPrefs() {
  const [prefs, setPrefs] = useState(load)
  useEffect(() => {
    const handler = () => setPrefs(load())
    window.addEventListener(EVENT, handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener(EVENT, handler)
      window.removeEventListener('storage', handler)
    }
  }, [])
  return prefs
}

// The `platform` query value for a set of slugs. Empty set means every platform,
// which the API expresses by the parameter being absent, and `buildQuery` and
// `homeFilterParams` both drop 'all'.
export function platformParam(platforms) {
  return platforms && platforms.length ? platforms.join(',') : 'all'
}
