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
const BASE_COLUMNS =
  'master_id, environment, title, platforms, earned_awards, total_awards, percent, ' +
  'earned_points, earned_exp, playtime_minutes, playtime_label, status, beaten, ' +
  'last_played, first_played, completion_date, cover_small, cover_standard, cover_tile, ' +
  'achievements_url, updated_at, length_minutes, genre, release_year, cover_igdb'

// keywords powers the shuffler's soulslike-style filters; games.genre holds a single
// IGDB genre and cannot express them.
// igdb_rating is added by a later migration + populated by the IGDB enrich. Select
// it when present; if the column doesn't exist yet, fall back so the library and
// the status lists still load. Only "Best of your backlog" needs the rating.
export const LIST_GAME_COLUMNS = `${BASE_COLUMNS}, igdb_rating, keywords`

const CACHE_KEY = 'library:games'

let cache = null

async function fetchLibrary() {
  const ordered = (cols) =>
    supabase.from('games').select(cols).order('last_played', { ascending: false, nullsFirst: false })

  let { data, error } = await ordered(LIST_GAME_COLUMNS)
  if (error && /igdb_rating|keywords/i.test(error.message || '')) {
    ;({ data, error } = await ordered(BASE_COLUMNS))
  }
  if (error) throw new Error(error.message || 'Library request failed')
  return data || []
}

export function useLibraryGames() {
  const [state, setState] = useState(() => cache || { games: [], loading: true, error: null })

  useEffect(() => {
    if (cache) {
      setState(cache)
      return undefined
    }
    let alive = true

    // maxAge 0 -> a cached payload is always served immediately AND always
    // revalidated, so the list is on screen at once and correct a moment later.
    swr(CACHE_KEY, fetchLibrary, {
      maxAge: 0,
      onFresh: (games) => {
        cache = { games, loading: false, error: null }
        if (alive) setState(cache)
      },
    })
      .then(({ value, stale }) => {
        const next = { games: value || [], loading: false, error: null }
        // Only the network payload is promoted to the session cache; a stale
        // disk payload must not short-circuit the refresh for later mounts.
        if (!stale) cache = next
        if (alive) setState(next)
      })
      .catch((err) => {
        // Nothing cached and the network failed - surface it.
        if (alive) setState({ games: [], loading: false, error: err.message || 'Library request failed' })
      })

    return () => {
      alive = false
    }
  }, [])

  return state
}
