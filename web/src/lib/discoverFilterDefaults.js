import { useEffect, useState } from 'react'
import { PRODUCTION_SCALE_KEYS } from './productionScale.js'

const KEY = 'gamedeck_discover_filter_defaults_v1'
const EVENT = 'gd-discover-filter-defaults-change'

const VALID_STATUSES = new Set(['all', 'released', 'upcoming'])
const VALID_SORTS = new Set(['popularity', 'anticipated', 'rating', 'release', 'name'])

export const DEFAULT_DISCOVER_FILTER_DEFAULTS = {
  scales: [...PRODUCTION_SCALE_KEYS],
  browse: {
    preset: null,
    genre: 'all',
    year: 'all',
    status: 'all',
    sort: 'popularity',
  },
  forYou: {
    only: null,
  },
}

function copy(defaults) {
  return {
    scales: [...defaults.scales],
    browse: { ...defaults.browse },
    forYou: { ...defaults.forYou },
  }
}

function optionalKey(value) {
  return typeof value === 'string' && value ? value : null
}

export function normalizeDiscoverFilterDefaults(value) {
  const stored = value && typeof value === 'object' ? value : {}
  const browse = stored.browse && typeof stored.browse === 'object' ? stored.browse : {}
  const forYou = stored.forYou && typeof stored.forYou === 'object' ? stored.forYou : {}
  const selected = Array.isArray(stored.scales) ? new Set(stored.scales) : null
  const scales = selected
    ? PRODUCTION_SCALE_KEYS.filter((key) => selected.has(key))
    : [...PRODUCTION_SCALE_KEYS]
  const year = browse.year === 'all' || Number.isInteger(browse.year) ? browse.year : 'all'

  return {
    scales,
    browse: {
      preset: optionalKey(browse.preset),
      genre: typeof browse.genre === 'string' && browse.genre ? browse.genre : 'all',
      year,
      status: VALID_STATUSES.has(browse.status) ? browse.status : 'all',
      sort: VALID_SORTS.has(browse.sort) ? browse.sort : 'popularity',
    },
    forYou: {
      only: optionalKey(forYou.only),
    },
  }
}

function load() {
  if (typeof localStorage === 'undefined') return copy(DEFAULT_DISCOVER_FILTER_DEFAULTS)
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || 'null')
    return stored ? normalizeDiscoverFilterDefaults(stored) : copy(DEFAULT_DISCOVER_FILTER_DEFAULTS)
  } catch {
    return copy(DEFAULT_DISCOVER_FILTER_DEFAULTS)
  }
}

export function getDiscoverFilterDefaults() {
  return load()
}

export function setDiscoverFilterDefaults(next) {
  const normalized = normalizeDiscoverFilterDefaults(next)
  try {
    localStorage.setItem(KEY, JSON.stringify(normalized))
  } catch {
    /* storage unavailable */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
  return copy(normalized)
}

export function resetDiscoverFilterDefaults() {
  return setDiscoverFilterDefaults(DEFAULT_DISCOVER_FILTER_DEFAULTS)
}

export function useDiscoverFilterDefaults() {
  const [defaults, setDefaults] = useState(load)
  useEffect(() => {
    const handler = () => setDefaults(load())
    window.addEventListener(EVENT, handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener(EVENT, handler)
      window.removeEventListener('storage', handler)
    }
  }, [])
  return defaults
}
