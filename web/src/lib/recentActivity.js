import { supabase } from './supabase.js'
import { dayKey } from './playWeek.js'

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
