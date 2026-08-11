// Weekly gaming news, written by the n8n "Weekly News Digest" workflow into the
// Supabase `news` table and read here with the anon key (same pattern as the
// Game Pass rail). One curated pick per row: title, full summary, sources, image,
// plus the primary game it's about (matched to IGDB in the digest).
import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { normTitle } from './discover.js'

// Keep roughly the last four weeks. week_of is a DATE (Monday of the digest week).
const WEEKS_KEPT = 4
const SEEN_KEY = 'gamedeck_news_seen_week_v1'
const SEEN_EVENT = 'gd-news-seen'

const BASE_SELECT =
  'id, week_of, rank, title, summary, image_url, primary_url, sources, published_at'
// game_* columns are added by a later migration. Select them when present; fall
// back to the base columns if the migration hasn't run yet, so the tab never breaks.
const FULL_SELECT = `${BASE_SELECT}, game_name, game_igdb_id, game_cover`

export async function fetchNews() {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - WEEKS_KEPT * 7)
  const cutoffIso = cutoff.toISOString().slice(0, 10) // YYYY-MM-DD

  const run = (sel) =>
    supabase
      .from('news')
      .select(sel)
      .gte('week_of', cutoffIso)
      .order('week_of', { ascending: false })
      .order('rank', { ascending: true })

  let { data, error } = await run(FULL_SELECT)
  if (error && /game_(name|igdb_id|cover)/i.test(error.message || '')) {
    ;({ data, error } = await run(BASE_SELECT))
  }

  if (error) return []
  return (data || []).map((r) => ({
    id: r.id,
    weekOf: r.week_of,
    rank: r.rank,
    title: r.title,
    summary: r.summary,
    image: r.image_url || null,
    primaryUrl: r.primary_url,
    sources: normalizeSources(r.sources, r.primary_url),
    publishedAt: r.published_at || null,
    // Matched primary game (any of these may be null when no confident match).
    gameName: r.game_name || null,
    gameIgdbId: r.game_igdb_id || null,
    gameCover: r.game_cover || null,
  }))
}

// sources is jsonb: [{ name, url }]. Guard against nulls / bad shapes and fall
// back to the primary url so a card always has at least one working link.
function normalizeSources(raw, primaryUrl) {
  let list = []
  if (Array.isArray(raw)) list = raw
  const clean = list
    .filter((s) => s && typeof s.url === 'string' && s.url)
    .map((s) => ({ name: (s.name || hostOf(s.url)).toString(), url: s.url }))
  if (clean.length > 0) return clean
  if (primaryUrl) return [{ name: hostOf(primaryUrl), url: primaryUrl }]
  return []
}

export function hostOf(url) {
  try {
    return String(url).replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '')
  } catch {
    return ''
  }
}

// Collapse repeated outlets to unique sources (first occurrence wins), so a story
// covered five times by three outlets shows three links, not five.
export function dedupeSources(sources) {
  const seen = new Set()
  const out = []
  for (const s of sources || []) {
    const key = (s.name || s.url || '').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

// Group flat rows (already sorted week desc, rank asc) into week sections, capped
// at WEEKS_KEPT groups. Each group: { weekOf, items }.
export function groupByWeek(rows) {
  const groups = []
  const byWeek = new Map()
  for (const row of rows) {
    if (!byWeek.has(row.weekOf)) {
      const g = { weekOf: row.weekOf, items: [] }
      byWeek.set(row.weekOf, g)
      groups.push(g)
    }
    byWeek.get(row.weekOf).items.push(row)
  }
  return groups.slice(0, WEEKS_KEPT)
}

// Where does the matched game sit for this user? Library and wishlist take
// precedence over Game Pass (per the design). Returns 'library' | 'wishlist' |
// 'gamepass' | null.
export function gameStatus(item, sets) {
  if (!item || (!item.gameIgdbId && !item.gameName)) return null
  const { wishlistIds, gamepassIds, libraryTitles } = sets || {}
  const id = Number(item.gameIgdbId) || 0
  if (libraryTitles && item.gameName && libraryTitles.has(normTitle(item.gameName))) return 'library'
  if (id && wishlistIds && wishlistIds.has(id)) return 'wishlist'
  if (id && gamepassIds && gamepassIds.has(id)) return 'gamepass'
  return null
}

// --- Unread signal on the News tab -----------------------------------------
// A tab-level "new weekly drop" dot: compare the newest week in the table to the
// last week the user actually opened News on.

export function getSeenWeek() {
  try {
    return localStorage.getItem(SEEN_KEY) || ''
  } catch {
    return ''
  }
}

export function markNewsSeen(weekOf) {
  if (!weekOf) return
  try {
    if (localStorage.getItem(SEEN_KEY) === weekOf) return
    localStorage.setItem(SEEN_KEY, weekOf)
  } catch {
    // ignore storage failures
  }
  window.dispatchEvent(new Event(SEEN_EVENT))
}

export async function fetchLatestWeek() {
  const { data, error } = await supabase
    .from('news')
    .select('week_of')
    .order('week_of', { ascending: false })
    .limit(1)
  if (error || !data || !data.length) return ''
  return data[0].week_of || ''
}

// Boolean hook: true when there's a newer week than the user has opened. Cleared
// (recomputed) whenever markNewsSeen fires.
export function useNewsUnread() {
  const [unread, setUnread] = useState(false)

  useEffect(() => {
    let alive = true
    const check = async () => {
      const latest = await fetchLatestWeek()
      if (!alive) return
      setUnread(Boolean(latest) && latest > getSeenWeek())
    }
    check()
    const onSeen = () => {
      if (alive) setUnread(false)
    }
    window.addEventListener(SEEN_EVENT, onSeen)
    return () => {
      alive = false
      window.removeEventListener(SEEN_EVENT, onSeen)
    }
  }, [])

  return unread
}
