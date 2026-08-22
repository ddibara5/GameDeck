import { supabase } from './supabase.js'
import { swr } from './idbCache.js'
import { dayKey } from './playWeek.js'
import { parseDayOrInstant } from './format.js'

// One definition of the activity read. Two surfaces want it for different reasons
// and over different windows - the Activity feed lists every row, Insights only
// rolls up the last fortnight - so the WINDOW is a parameter and the query shape
// is not. The alternative was the same select written twice, which is how the
// Library ended up with two drifting column lists.
export const ACTIVITY_VIEW = 'v_recent_activity'

// Ordering is event_date DESC, so `limit` truncates the OLDEST rows. Anything that
// depends on recent rows being complete is therefore safe; anything that depends on
// the FULL window being complete must pass a limit above the expected row count.
export async function fetchRecentActivity({ days, limit }) {
  const since = dayKey(new Date(Date.now() - days * 86400000))
  let q = supabase.from(ACTIVITY_VIEW).select('*').gte('event_date', since).order('event_date', { ascending: false })
  if (limit) q = q.limit(limit)
  return q
}

// Local-first wrapper around the same query.
//
// HomeTab awaited this before it drew anything at all, so the whole screen held
// a skeleton for one round trip - ~420ms on Dave's machine, of which 11ms is the
// server. Now the rows come off disk on the first frame and `onFresh` delivers
// the network answer when it lands.
//
// The key carries the window, because the two callers ask for different spans
// and a cache keyed only on the table would serve Insights' fortnight to Home's
// week. maxAge 0: play events arrive daily, so a cached list is always shown
// AND always refreshed.
export async function loadRecentActivity({ days, limit }, onFresh) {
  const key = `activity:${days}:${limit || 'all'}`
  const { value } = await swr(
    key,
    async () => {
      const { data, error } = await fetchRecentActivity({ days, limit })
      if (error) throw new Error(error.message || 'Activity request failed')
      return data || []
    },
    { maxAge: 0, onFresh },
  ).catch(() => ({ value: [] }))
  return value || []
}

// The earliest day the activity history holds, used to decide whether a
// week-over-week comparison spans data that actually exists. One row, ascending,
// rather than a min() aggregate, because PostgREST has no aggregate syntax and a
// full scan of the view to compute one in the client would be absurd.
export async function fetchActivityStart() {
  const { data } = await supabase
    .from(ACTIVITY_VIEW)
    .select('event_date')
    .order('event_date', { ascending: true })
    .limit(1)
  const first = data && data[0] && data[0].event_date
  return first ? parseDayOrInstant(first) : null
}
