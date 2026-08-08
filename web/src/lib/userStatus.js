// Client-side game status overrides (GameTrack-style), stored in localStorage.
// Statuses: 'backlog' | 'playing' | 'finished' | 'abandoned'
// Achievement % is NOT completion; the user's status (manual, or derived) is the truth.
import { useEffect, useState } from 'react'

const KEY = 'gamedeck_status_v1'

export const STATUSES = ['backlog', 'playing', 'finished', 'abandoned']
export const STATUS_LABELS = {
  backlog: 'Backlog',
  playing: 'Playing',
  finished: 'Finished',
  abandoned: 'Abandoned',
}

function loadMap() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {}
  } catch {
    return {}
  }
}

function saveMap(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    /* storage unavailable */
  }
}

export function getStatusMap() {
  return loadMap()
}

export function getOverride(masterId) {
  return loadMap()[String(masterId)] || null
}

export function setStatus(masterId, status) {
  const map = loadMap()
  const id = String(masterId)
  if (!status) delete map[id]
  else map[id] = status
  saveMap(map)
  window.dispatchEvent(new Event('gd-status-change'))
}

// Status when the user hasn't set one:
//   never played           -> backlog
//   played >= story length -> finished  (keys off the IGDB story-completion %)
//   otherwise              -> playing
export function derivedStatus(game) {
  if (!game) return 'backlog'
  const played = game.last_played || (game.playtime_minutes || 0) > 0
  if (!played) return 'backlog'
  const len = Number(game.length_minutes) || 0
  if (len > 0 && (game.playtime_minutes || 0) / len >= 1) return 'finished'
  return 'playing'
}

export function effectiveStatus(game, map) {
  const m = map || loadMap()
  return m[String(game.master_id)] || derivedStatus(game)
}

// React hook: returns the live status map, re-rendering on any change.
export function useStatusMap() {
  const [map, setMap] = useState(loadMap)
  useEffect(() => {
    const handler = () => setMap(loadMap())
    window.addEventListener('gd-status-change', handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener('gd-status-change', handler)
      window.removeEventListener('storage', handler)
    }
  }, [])
  return map
}

// HowLongToBeat-based story progress (0-100) if the story length is known.
export function storyProgress(playtimeMinutes, hltbHours) {
  if (!hltbHours || hltbHours <= 0) return null
  const pct = Math.round(((playtimeMinutes || 0) / (hltbHours * 60)) * 100)
  return Math.max(0, Math.min(100, pct))
}
