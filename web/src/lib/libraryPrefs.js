// On-device library view preferences: games the user has hidden ("not a game"),
// and an optional "hide games released before <year>" cutoff. Mirrors the status
// store: a module-level read + a change event so the drawer counts and the list
// views stay in sync without prop drilling.
import { useEffect, useState } from 'react'

const HIDDEN_KEY = 'gamedeck_hidden_v1'
const YEAR_KEY = 'gamedeck_hide_before_year_v1'
const EVENT = 'gd-libprefs-change'

function loadHidden() {
  try {
    const arr = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')
    return new Set(Array.isArray(arr) ? arr.map(String) : [])
  } catch {
    return new Set()
  }
}

function saveHidden(set) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set]))
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT))
}

export function getHidden() {
  return loadHidden()
}

export function isHidden(masterId) {
  return loadHidden().has(String(masterId))
}

// Toggle a game's hidden state; returns the new state (true = now hidden).
export function toggleHidden(masterId) {
  const set = loadHidden()
  const id = String(masterId)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  saveHidden(set)
  return set.has(id)
}

function loadYear() {
  try {
    const v = Number(localStorage.getItem(YEAR_KEY))
    return v > 0 ? v : null
  } catch {
    return null
  }
}

export function getHideBeforeYear() {
  return loadYear()
}

export function setHideBeforeYear(year) {
  try {
    if (year) localStorage.setItem(YEAR_KEY, String(year))
    else localStorage.removeItem(YEAR_KEY)
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT))
  return loadYear()
}

// A game passes the year filter when there's no cutoff, when its release year is
// unknown (never hide something we can't date), or when it's at/after the cutoff.
export function passesYear(game, year) {
  if (!year) return true
  const y = Number(game && game.release_year) || 0
  if (!y) return true
  return y >= year
}

// Live hidden-set + year cutoff, re-rendering on any change.
export function useLibraryPrefs() {
  const [prefs, setPrefs] = useState(() => ({ hidden: loadHidden(), hideBeforeYear: loadYear() }))
  useEffect(() => {
    const handler = () => setPrefs({ hidden: loadHidden(), hideBeforeYear: loadYear() })
    window.addEventListener(EVENT, handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener(EVENT, handler)
      window.removeEventListener('storage', handler)
    }
  }, [])
  return prefs
}
