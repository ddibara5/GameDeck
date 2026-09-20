import { effTs, isOut, relOf, releaseDaysFromToday } from './wishlistRelease.js'

// Release Watch selection and labels.
//
// Port of the Expo pilot's lib/release-watch.ts (Sept 11 commit: the selection
// grew from 2 to 12 per side for the New releases / Upcoming home rails, and
// releasedAgoLabel was added for the "N days ago" rail captions). Catalog
// release dates are calendar dates encoded at UTC midnight; the local date is
// rebuilt from the UTC components so the day never shifts west of UTC.

export function releaseDate(item) {
  if (typeof item.released !== 'number' || !Number.isFinite(item.released)) return null
  const utc = new Date(item.released * 1000)
  if (!Number.isFinite(utc.getTime())) return null
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())
}

export function releaseWatch(wishlist, today = new Date()) {
  const rows = (wishlist || []).map((item) => ({ item, rel: relOf(item) }))

  // Use the exact same out/upcoming decision as the expanded Release watch page,
  // so the Home count cannot disagree with the list the chevron opens.
  const comingUpAll = rows
    .filter(({ rel }) => !isOut(rel, today))
    .sort((a, b) => effTs(a.rel) - effTs(b.rel))

  const outAll = rows
    .filter(({ rel }) => isOut(rel, today))
    .sort((a, b) => effTs(b.rel) - effTs(a.rel))

  // Home is a preview, not the archive. Keep recent releases useful on the
  // surface while the header count still reflects the full expanded list.
  const recentOut = outAll.filter(({ rel }) => {
    const days = releaseDaysFromToday(rel, today)
    return days != null && days >= -365 && days <= 0
  })

  return {
    comingUp: comingUpAll.slice(0, 12).map(({ item }) => item),
    comingUpCount: comingUpAll.length,
    outNow: recentOut.slice(0, 12).map(({ item }) => item),
    outNowCount: outAll.length,
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

// Recency caption for the New releases rail: "Today", "1 day ago", "8 days
// ago". Calendar days, not elapsed time, so a game released this morning is
// "Today" no matter what hour the page is opened.
export function releasedAgoLabel(item, today = new Date()) {
  const date = releaseDate(item)
  if (!date) return item.release_label ?? 'Released'
  const now = new Date(today)
  now.setHours(0, 0, 0, 0)
  const days = Math.max(0, Math.round((now - date) / 86400000))
  if (days === 0) return 'Today'
  return `${days} day${days === 1 ? '' : 's'} ago`
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
