import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// One shared, session-cached fetch of the whole library. Used by the drawer (for
// list counts) and the drawer-opened list views so opening a list is instant and
// we don't refetch the library per view.
const BASE_COLUMNS =
  'master_id, environment, title, platforms, earned_awards, total_awards, percent, ' +
  'earned_points, earned_exp, playtime_minutes, playtime_label, status, beaten, ' +
  'last_played, first_played, completion_date, cover_small, cover_standard, cover_tile, ' +
  'achievements_url, updated_at, length_minutes, genre, release_year, cover_igdb'

// igdb_rating is added by a later migration + populated by the IGDB enrich. Select
// it when present; if the column doesn't exist yet, fall back so the library and
// the status lists still load. Only "Best of your backlog" needs the rating.
export const LIST_GAME_COLUMNS = `${BASE_COLUMNS}, igdb_rating`

let cache = null

export function useLibraryGames() {
  const [state, setState] = useState(() => cache || { games: [], loading: true, error: null })

  useEffect(() => {
    if (cache) {
      setState(cache)
      return undefined
    }
    let alive = true
    ;(async () => {
      const ordered = (cols) =>
        supabase.from('games').select(cols).order('last_played', { ascending: false, nullsFirst: false })

      let { data, error } = await ordered(LIST_GAME_COLUMNS)
      if (error && /igdb_rating/i.test(error.message || '')) {
        ;({ data, error } = await ordered(BASE_COLUMNS))
      }

      const next = { games: data || [], loading: false, error: error ? error.message : null }
      if (!error) cache = next
      if (alive) setState(next)
    })()
    return () => {
      alive = false
    }
  }, [])

  return state
}
