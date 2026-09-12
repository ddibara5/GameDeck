// Release Watch selection and labels.
//
// Exact port of the Expo pilot's lib/release-watch.ts. Catalog release dates
// are calendar dates encoded at UTC midnight; the local date is rebuilt from
// the UTC components so the day never shifts west of UTC.

export function releaseDate(item) {
  if (typeof item.released !== 'number' || !Number.isFinite(item.released)) return null
  const utc = new Date(item.released * 1000)
  if (!Number.isFinite(utc.getTime())) return null
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())
}

export function releaseWatch(wishlist, today = new Date()) {
  const now = new Date(today)
  now.setHours(0, 0, 0, 0)
  const dated = (wishlist || []).flatMap((item) => {
    const date = releaseDate(item)
    return date ? [{ item, date }] : []
  })
  return {
    comingUp: dated
      .filter(({ date }) => date > now)
      .sort((a, b) => a.date - b.date)
      .slice(0, 2)
      .map(({ item }) => item),
    outNow: dated
      .filter(({ date }) => date <= now)
      .sort((a, b) => b.date - a.date)
      .slice(0, 2)
      .map(({ item }) => item),
  }
}

export function releaseLabel(item, today = new Date()) {  const date = releaseDate(item)
  if (!date) return item.release_label ?? 'Date to come'
  const start = new Date(today)
  start.setHours(0, 0, 0, 0)
  const days = Math.round((date - start) / 86400000)
  if (days === 0) return 'Out today'
  if (days === 1) return 'Tomorrow'
  if (days > 1 && days < 8) return `In ${days} days`
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== start.getFullYear() ? { year: 'numeric' } : {}),
  })
}

// Direct wishlist read for Release Watch, separate from the wishlist module's
// local-first loader: that loader never surfaces a refresh failure (it falls
// back to its cache), and Home needs the failure signal for the soft
// "Couldn't refresh releases" line. Columns mirror wishlist.js, including its
// fallback when the date columns don't exist yet.
const RELEASE_COLUMNS = 'igdb_id, title, cover, released, date_precision, release_label'
const MISSING_DATE_COL = /released|date_precision|release_label|last_synced/i

// The Supabase client is a parameter so this module stays importable in plain
// node tests; callers pass the real client from './supabase.js'.
export async function fetchReleaseCandidates(client) {
  const run = (cols) =>
    client.from('wishlist').select(cols).order('created_at', { ascending: false })
  let { data, error } = await run(RELEASE_COLUMNS)
  if (error && MISSING_DATE_COL.test(error.message || '')) {
    ;({ data, error } = await run('igdb_id, title, cover, release_label'))
  }
  if (error) throw new Error(error.message || 'Release watch request failed')
  return data || []
}
