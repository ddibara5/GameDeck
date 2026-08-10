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

// A game counts as "playing" when its most recent play falls within this many
// days. Bump it if you play long games in bursts; drop it to keep the list tighter.
export const PLAYING_WINDOW_DAYS = 21

// Status when the user hasn't set one:
//   never played                          -> backlog (no list; dormant)
//   played past its IGDB story length     -> finished
//   played within the last N days         -> playing
//   played, but a while ago and unfinished -> backlog (dormant; tag it yourself)
export function derivedStatus(game) {
  if (!game) return 'backlog'
  const playedAt = game.last_played ? Date.parse(game.last_played) : NaN
  const hasPlayed = !Number.isNaN(playedAt) || (game.playtime_minutes || 0) > 0
  if (!hasPlayed) return 'backlog'
  const len = Number(game.length_minutes) || 0
  if (len > 0 && (game.playtime_minutes || 0) / len >= 1) return 'finished'
  if (!Number.isNaN(playedAt) && Date.now() - playedAt <= PLAYING_WINDOW_DAYS * 86400000) return 'playing'
  return 'backlog'
}

export function effectiveStatus(game, map) {
  const m = map || loadMap()
  return m[String(game.master_id)] || derivedStatus(game)
}

// A synced row is a real game (not an app / media tile) when it has at least one
// achievement OR it matched a game on IGDB (so it got cover art). This is the same
// guard the Library "Fresh from your backlog" shelf uses, lifted so every status
// list applies it too.
export function isRealGame(game) {
  if (!game) return false
  return (Number(game.total_awards) || 0) > 0 || Boolean(game.cover_igdb)
}

// Whether a row should appear in the drawer status / smart lists at all. Real
// games always qualify; anything you manually tagged is honoured too, so an
// explicit status never gets filtered out as "junk".
export function includeInLists(game, map) {
  if (!game) return false
  if (isRealGame(game)) return true
  const m = map || loadMap()
  return Boolean(m[String(game.master_id)])
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
