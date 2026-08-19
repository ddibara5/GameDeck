import { supabase } from './supabase.js'
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
