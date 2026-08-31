import { supabase } from './supabase.js'
import { swr } from './idbCache.js'
import { dayKey } from './playWeek.js'
import { parseDayOrInstant } from './format.js'

// One definition of the activity read. Two surfaces want it for different reasons
// and over different windows - the Activity feed lists every row, Insights keeps
// two 30-day periods for comparison - so the WINDOW is a parameter and the query shape
// is not. The alternative was the same select written twice, which is how the
// Library ended up with two drifting column lists.
export const ACTIVITY_VIEW = 'v_recent_activity'

const activityCache = new Map()
const activityInflight = new Map()
let activityStartCache
let activityStartInflight = null

function activityKey({ days, limit }) {
  return `activity:${days}:${limit || 'all'}`
}

export function getRecentActivityCache(options) {
  return activityCache.get(activityKey(options)) || null
}

export function getActivityStartCache() {
  return activityStartCache === undefined ? null : activityStartCache
}

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
export async function loadRecentActivity({ days, limit }, onFresh, { throwOnError = false } = {}) {
  const options = { days, limit }
  const key = activityKey(options)
  if (activityCache.has(key)) return activityCache.get(key)
  if (activityInflight.has(key)) return activityInflight.get(key)

  const request = swr(
    key,
    async () => {
      const { data, error } = await fetchRecentActivity(options)
      if (error) throw new Error(error.message || 'Activity request failed')
      return data || []
    },
    {
      maxAge: 0,
      onFresh: (rows) => {
        const next = rows || []
        activityCache.set(key, next)
        if (onFresh) onFresh(next)
      },
    },
  )
    .then(({ value }) => {
      const next = value || []
      if (!activityCache.has(key)) activityCache.set(key, next)
      return activityCache.get(key)
    })
    .catch((error) => {
      if (activityCache.has(key)) return activityCache.get(key)
      if (throwOnError) throw error
      return []
    })
    .finally(() => activityInflight.delete(key))

  activityInflight.set(key, request)
  return request
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

// The earliest activity date changes only when history is backfilled. Persist it
// and refresh once per app session instead of making Insights wait on a separate
// one-row request every time the tab is revisited.
export async function loadActivityStart(onFresh) {
  if (activityStartCache !== undefined) return activityStartCache
  if (activityStartInflight) return activityStartInflight

  activityStartInflight = swr('activity:start', fetchActivityStart, {
    maxAge: 24 * 60 * 60 * 1000,
    onFresh: (value) => {
      activityStartCache = value || null
      if (onFresh) onFresh(activityStartCache)
    },
  })
    .then(({ value }) => {
      if (activityStartCache === undefined) activityStartCache = value || null
      return activityStartCache
    })
    .catch(() => null)
    .finally(() => {
      activityStartInflight = null
    })
  return activityStartInflight
}
