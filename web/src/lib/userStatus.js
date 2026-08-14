// Per-game status overrides (GameTrack-style).
// Statuses: 'backlog' | 'playing' | 'finished' | 'abandoned'
// Achievement % is NOT completion; the user's status (manual, or derived) is the truth.
//
// STORAGE: Supabase `game_status` is the source of truth; localStorage is a cache.
//
// This used to be localStorage only, which meant your tags were device-local,
// absent on a second device, and gone if you cleared site data. They are now
// synced. localStorage stays because `effectiveStatus(game, map)` is called from
// render in half a dozen components and has to stay synchronous, so the cache is
// what makes the first paint correct before the network answers.
//
// Only EXPLICIT overrides are stored. `derivedStatus` stays client-side, so the
// table is a record of what you decided rather than what was inferred, and the
// two never get confused.
import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

const KEY = 'gamedeck_status_v1'
// Set once the pre-existing local-only tags have been pushed up. After that the
// server wins, so clearing a status on one device is not resurrected by another.
const MIGRATED_KEY = 'gamedeck_status_migrated_v1'

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

function emit() {
  window.dispatchEvent(new Event('gd-status-change'))
}

export function getStatusMap() {
  return loadMap()
}

export function getOverride(masterId) {
  return loadMap()[String(masterId)] || null
}

// Optimistic: the cache and the UI update immediately, the write follows. A failed
// write reloads from the server rather than leaving the two disagreeing silently.
export function setStatus(masterId, status) {
  const map = loadMap()
  const id = String(masterId)
  if (!status) delete map[id]
  else map[id] = status
  saveMap(map)
  emit()

  const write = status
    ? supabase.from('game_status').upsert(
        { master_id: Number(masterId), status, updated_at: new Date().toISOString() },
        { onConflict: 'master_id' }
      )
    : supabase.from('game_status').delete().eq('master_id', Number(masterId))

  Promise.resolve(write)
    .then(({ error }) => {
      if (error) return pullFromServer()
      return undefined
    })
    .catch(() => pullFromServer())
}

// ------------------------------------------------------------------ syncing

let pulled = null

async function pullFromServer() {
  const { data, error } = await supabase.from('game_status').select('master_id, status')
  if (error) return
  const server = {}
  for (const r of data || []) {
    if (r && r.master_id != null && r.status) server[String(r.master_id)] = r.status
  }

  // One-time promotion of tags made before this table existed. Union, not
  // overwrite: nothing set on this device is thrown away on the way up. After the
  // flag is set the server is authoritative, so a status cleared elsewhere stays
  // cleared instead of being pushed back by a stale local copy.
  let migrated = false
  try {
    migrated = localStorage.getItem(MIGRATED_KEY) === '1'
  } catch {
    migrated = false
  }

  if (!migrated) {
    const local = loadMap()
    const onlyLocal = Object.keys(local).filter((id) => !server[id] && STATUSES.includes(local[id]))
    if (onlyLocal.length) {
      const rows = onlyLocal.map((id) => ({
        master_id: Number(id),
        status: local[id],
        updated_at: new Date().toISOString(),
      }))
      const { error: upErr } = await supabase
        .from('game_status')
        .upsert(rows, { onConflict: 'master_id' })
      // Only claim the migration is done if it actually landed, otherwise retry
      // on the next load rather than stranding the tags locally.
      if (upErr) return
      for (const id of onlyLocal) server[id] = local[id]
    }
    try {
      localStorage.setItem(MIGRATED_KEY, '1')
    } catch {
      /* storage unavailable - the union is idempotent, so retrying is harmless */
    }
  }

  saveMap(server)
  emit()
}

// Kicked off once per session, on first use of the hook.
export function syncStatuses() {
  if (!pulled) pulled = pullFromServer().catch(() => {})
  return pulled
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

// The stored override, or null when nothing was ever set and what you are
// looking at is derived. The picker needs the difference: highlighting a derived
// status exactly like a chosen one leaves no way to tell what you decided from
// what the app guessed, and no way back to the guess once you have overridden
// it. This is what makes `setStatus(id, null)` reachable.
export function explicitStatus(game, map) {
  if (!game) return null
  const m = map || loadMap()
  return m[String(game.master_id)] || null
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
// Paints from the cache immediately, then reconciles with the server once.
export function useStatusMap() {
  const [map, setMap] = useState(loadMap)
  useEffect(() => {
    syncStatuses()
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
