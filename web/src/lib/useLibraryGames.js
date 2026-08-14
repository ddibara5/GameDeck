import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { swr } from './idbCache.js'

// One shared, session-cached fetch of the whole library. Used by the drawer (for
// list counts) and the drawer-opened list views so opening a list is instant and
// we don't refetch the library per view.
//
// Local-first: the last good payload is persisted to IndexedDB, so a cold app
// start renders the library off disk immediately instead of waiting on Supabase.
// The network fetch still runs every time (this is the user's own data and it
// should be current) and swaps in as soon as it lands.
// Every column here is paid for on every cold start: fetched, parsed, written to
// IndexedDB and held in memory for all 513 rows. Measured against the live table,
// the full 29-column select was 758 kB of JSON; this list is 282 kB. Before adding
// one back, check that something actually reads it.
//
// Removed 14 Aug 2026 after grepping every reference in src/:
//   earned_exp, earned_points, beaten, first_played, completion_date, status
//     - zero readers anywhere. games.status is separately known to be the literal
//       string "partial" on 350 of 351 rows, so it carries no information either.
//       (The ~89 `status` hits in the codebase are the USER status system, which
//       is a different table entirely.)
//   cover_standard, cover_tile
//     - pure fallbacks behind cover_igdb, and measured to be dead weight: of 513
//       rows, 479 have cover_igdb and the remaining 34 ALL have cover_small.
//       Nothing has neither, so no row could ever reach these two.
//   achievements_url
//     - 34 kB to serve one link in GameSheet, which shows one game at a time.
//       Fetched there per game instead.
//   keywords
//     - 234 kB, 31% of the whole payload, read only by the vibe chips and the
//       shuffler. Now a sidecar: see fetchKeywords below.
const BASE_COLUMNS =
  'master_id, environment, title, platforms, earned_awards, total_awards, percent, ' +
  'playtime_minutes, playtime_label, last_played, cover_small, ' +
  'updated_at, length_minutes, genre, release_year, cover_igdb, igdb_id'

// igdb_id is in BASE_COLUMNS, not the optional tail: the shuffler joins library rows
// to the Game Pass catalog on it, and without it every library game looks un-covered,
// so the "favour Game Pass" weighting and its badges silently do nothing.
// igdb_rating is added by a later migration + populated by the IGDB enrich. Select
// it when present; if the column doesn't exist yet, fall back so the library and
// the status lists still load. Only "Best of your backlog" needs the rating.
// franchises is the News tab's series match: it is what lets a story about
// Persona find Persona 5 Royal when the story names no owned title. Added by a
// later migration, so it sits in the optional tail with the others.
export const LIST_GAME_COLUMNS = `${BASE_COLUMNS}, igdb_rating, franchises`

const CACHE_KEY = 'library:games'
const KEYWORDS_CACHE_KEY = 'library:keywords'

let cache = null
let keywordCache = null

async function fetchLibrary() {
  const ordered = (cols) =>
    supabase.from('games').select(cols).order('last_played', { ascending: false, nullsFirst: false })

  let { data, error } = await ordered(LIST_GAME_COLUMNS)
  if (error && /igdb_rating|franchises/i.test(error.message || '')) {
    ;({ data, error } = await ordered(BASE_COLUMNS))
  }
  if (error) throw new Error(error.message || 'Library request failed')
  return data || []
}

// keywords, on demand.
//
// This is deliberately NOT a second library query. The rule that there is one
// library fetch exists because LibraryTab once ran its own SELECT with a private
// column list that drifted and silently broke the vibe chips. This is two columns
// keyed on master_id, it lives in the same file as the main query so the two
// cannot drift apart, and it returns a lookup rather than a second copy of the
// library.
//
// It is a sidecar because keywords are 234 kB of a 758 kB payload and only two
// surfaces read them, both of them lazily loaded chunks that are usually never
// opened: the Library vibe chips and the shuffler.
async function fetchKeywords() {
  const { data, error } = await supabase.from('games').select('master_id, keywords')
  if (error) throw new Error(error.message || 'Keyword request failed')
  return data || []
}

function toKeywordMap(rows) {
  const m = new Map()
  for (const r of rows || []) {
    if (r && r.master_id != null) m.set(String(r.master_id), r.keywords || [])
  }
  return m
}

// The Exophase achievements link for one game, fetched when its sheet opens.
// Carrying it on every library row cost 34 kB to serve a single link on a sheet
// that shows one game at a time.
//
// `fallback` is the game row itself: a payload cached to IndexedDB before this
// change still has the column inline, so an upgrading client shows the link on
// the first frame instead of waiting a round trip for something it already has.
const urlCache = new Map()

export function useAchievementsUrl(masterId, fallback) {
  const seeded = (fallback && fallback.achievements_url) || null
  const [url, setUrl] = useState(() => (masterId == null ? null : urlCache.get(String(masterId)) ?? seeded))

  useEffect(() => {
    if (masterId == null) {
      setUrl(null)
      return undefined
    }
    const key = String(masterId)
    if (urlCache.has(key)) {
      setUrl(urlCache.get(key))
      return undefined
    }
    if (seeded) {
      urlCache.set(key, seeded)
      setUrl(seeded)
      return undefined
    }
    let alive = true
    supabase
      .from('games')
      .select('achievements_url')
      .eq('master_id', masterId)
      .maybeSingle()
      .then(({ data }) => {
        const next = (data && data.achievements_url) || null
        urlCache.set(key, next)
        if (alive) setUrl(next)
      })
      // A missing link just means no link is rendered. Nothing to surface.
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [masterId, seeded])

  return url
}

// Returns a Map of master_id -> keywords, or null until it has loaded. Callers
// pass it to hasVibe/availableVibes, which fall back to game.keywords when it is
// absent, so a vibe surface renders correctly (just without chips) on the first
// frame and fills in a moment later.
//
// `enabled` is the whole point. The Library is the landing tab, so a hook that
// fetched on mount would pull the 84 kB of keywords on every cold start and the
// sidecar would have bought nothing. The Library passes `showFilters`, because
// the chips live inside the filter sheet; the shuffler takes the default, because
// it only mounts once you have already opened it.
export function useVibeKeywords(enabled = true) {
  const [map, setMap] = useState(() => keywordCache)

  useEffect(() => {
    if (!enabled || keywordCache) return undefined
    let alive = true
    swr(KEYWORDS_CACHE_KEY, fetchKeywords, {
      maxAge: 0,
      onFresh: (rows) => {
        keywordCache = toKeywordMap(rows)
        if (alive) setMap(keywordCache)
      },
    })
      .then(({ value, stale }) => {
        const next = toKeywordMap(value)
        if (!stale) keywordCache = next
        if (alive) setMap(next)
      })
      .catch(() => {
        // A missing keyword map is not an error worth surfacing: the chips just
        // do not appear, and every other filter still works.
      })
    return () => {
      alive = false
    }
    // `enabled` belongs here: it goes false -> true the first time the filter
    // sheet opens, which is the only moment this hook is ever meant to fetch.
  }, [enabled])

  return map
}

// One fetch per session, shared by every consumer.
//
// Six components call useLibraryGames, and several of them mount in the same
// tick on a cold start (the menu and the landing tab, at minimum). Each one used
// to start its own swr() because `cache` is only set once a fetch has already
// come back, so the first paint fired the 268 kB library query twice. The
// subscriber set below means the second and later mounts join the request that
// is already in flight instead of opening another one.
//
// `latest` is the last state broadcast to anyone, promoted or not. A component
// that mounts while the network refresh is still running gets the disk payload
// on its first frame, the same as one that was there from the start.
const subscribers = new Set()
let inflight = null
let latest = null

function broadcast(next, promote) {
  latest = next
  if (promote) cache = next
  for (const fn of subscribers) fn(next)
}

function loadLibrary() {
  if (inflight) return inflight
  // maxAge 0 -> a cached payload is always served immediately AND always
  // revalidated, so the list is on screen at once and correct a moment later.
  inflight = swr(CACHE_KEY, fetchLibrary, {
    maxAge: 0,
    onFresh: (games) => broadcast({ games, loading: false, error: null }, true),
  })
    .then(({ value, stale }) => {
      // Only the network payload is promoted to the session cache; a stale disk
      // payload must not short-circuit the refresh for later mounts.
      broadcast({ games: value || [], loading: false, error: null }, !stale)
    })
    .catch((err) => {
      // Nothing cached and the network failed - surface it, and clear the
      // in-flight handle so a later mount can retry rather than joining a
      // request that already failed.
      inflight = null
      broadcast({ games: [], loading: false, error: err.message || 'Library request failed' }, false)
    })
  return inflight
}

export function useLibraryGames() {
  const [state, setState] = useState(() => cache || { games: [], loading: true, error: null })

  useEffect(() => {
    if (cache) {
      setState(cache)
      return undefined
    }
    let alive = true
    const onState = (next) => {
      if (alive) setState(next)
    }
    subscribers.add(onState)
    if (latest) setState(latest)
    loadLibrary()

    return () => {
      alive = false
      subscribers.delete(onState)
    }
  }, [])

  return state
}
