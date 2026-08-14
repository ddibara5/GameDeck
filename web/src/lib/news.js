// Weekly gaming news, written by the n8n "Weekly News Digest" workflow into the
// Supabase `news` table and read here with the anon key (same pattern as the
// Game Pass rail). One curated pick per row: title, full summary, sources, image,
// plus the primary game it's about (matched to IGDB in the digest).
import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { normTitle } from './discover.js'
import { igdbCover } from './format.js'

// Keep roughly the last four weeks. week_of is a DATE (Monday of the digest week).
const WEEKS_KEPT = 4
// v2: the value stored here changed from a week_of date to a created_at
// timestamp when refreshes started adding to the current week instead of
// replacing it. A stale v1 date would compare as older than any timestamp and
// light the dot once, so the key is bumped rather than reinterpreted.
const SEEN_KEY = 'gamedeck_news_seen_stamp_v2'
const SEEN_EVENT = 'gd-news-seen'

const BASE_SELECT =
  'id, week_of, rank, title, summary, image_url, primary_url, sources, published_at, created_at'
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
      // Refreshes append to the current week, continuing the rank sequence. If
      // two rows ever land on the same rank the newer one sorts after, so the
      // order stays stable instead of depending on how Postgres feels.
      .order('created_at', { ascending: true })

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
    createdAt: r.created_at || null,
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

// --- Cover art -------------------------------------------------------------

// news.game_cover holds a FULL IGDB url ("https://images.igdb.com/.../co1234.jpg"),
// not the bare image id that igdbCover() expects. Feeding the url straight in
// produced ".../t_cover_small/https://images.igdb.com/.../co1234.jpg.jpg", a 404
// on every row, which is why every thumbnail in this tab was silently falling
// back to the initial letter. Accept either shape and normalise to the id.
export function coverSrc(cover, size = 't_cover_big') {
  if (!cover) return null
  const raw = String(cover)
  if (!raw.includes('/')) return igdbCover(raw, size)
  const m = /\/([^/]+)\.(?:jpg|png|webp)(?:\?.*)?$/i.exec(raw)
  return m ? igdbCover(m[1], size) : raw
}

// What the card can put in its image band, best first.
//
// A chain rather than a single choice because the article image is a hotlink to
// someone else's CDN and dies on its own schedule. When it does, the card should
// drop to the matched game's cover rather than losing its band, which is a
// bigger visual change than the missing photo. Only a story with neither draws
// no band at all.
//
// `fallbackCover` is the IGDB image id of a library row the story matched by
// FRANCHISE. Such a story named no game, so it carries no cover of its own, and
// without this it would be the one card in the section with no art at all -
// despite being the one with the strongest connection to the library.
export function cardArtChain(item, fallbackCover) {
  if (!item) return []
  const chain = []
  if (item.image) chain.push({ kind: 'article', src: item.image })
  const cover = coverSrc(item.gameCover, 't_cover_big')
  if (cover) chain.push({ kind: 'cover', src: cover })
  const fb = coverSrc(fallbackCover, 't_cover_big')
  if (fb && !chain.some((c) => c.src === fb)) chain.push({ kind: 'cover', src: fb })
  return chain
}

// --- Relevance -------------------------------------------------------------

// Franchise names shorter than this are not searched for inside a headline.
// "Ico" or "Tron" would match half the words in the English language once you
// allow them loose in a sentence, and a false "because you own this" is worse
// than a missed match.
const MIN_FRANCHISE = 5

// Index the library once per load. A game owned on several platforms has one row
// per environment (Grand Theft Auto V has three), and the row worth showing is
// the one carrying the playtime, so duplicates resolve to the most-played.
export function buildLibraryIndex(games) {
  const byId = new Map()
  const byTitle = new Map()
  const franchises = new Map()
  const better = (a, b) => (Number(a?.playtime_minutes) || 0) > (Number(b?.playtime_minutes) || 0)
  for (const g of games || []) {
    if (!g) continue
    const id = Number(g.igdb_id) || 0
    if (id && (!byId.has(id) || better(g, byId.get(id)))) byId.set(id, g)
    const key = normTitle(g.title || '')
    if (key && (!byTitle.has(key) || better(g, byTitle.get(key)))) byTitle.set(key, g)
    for (const raw of g.franchises || []) {
      const name = String(raw || '').trim()
      if (name.length < MIN_FRANCHISE) continue
      const k = name.toLowerCase()
      // The row that represents a series is the one carrying the most time, so
      // "the Persona series" resolves to Persona 5 Royal rather than the two
      // hours of Persona 5 from 2020.
      if (!franchises.has(k) || better(g, franchises.get(k).row)) franchises.set(k, { name, row: g })
    }
  }
  // Longest first, so a story about Persona 5 credits the Persona 5 collection
  // rather than the broader Persona franchise that also matches.
  const franchiseList = [...franchises.values()].sort((a, b) => b.name.length - a.name.length)
  return { byId, byTitle, franchiseList }
}

// Does this story's text mention a series in the library?
//
// Word-boundary matched so "Persona" does not fire on "personal", and length
// gated in buildLibraryIndex. The story TITLE is searched rather than the
// summary: a summary mentions half a dozen games in passing, a headline is
// about its subject.
function franchiseHit(item, franchiseList) {
  const hay = `${item.title || ''} ${item.gameName || ''}`.toLowerCase()
  if (!hay.trim()) return null
  for (const f of franchiseList || []) {
    const k = f.name.toLowerCase()
    const at = hay.indexOf(k)
    if (at < 0) continue
    const before = at === 0 ? ' ' : hay[at - 1]
    const after = at + k.length >= hay.length ? ' ' : hay[at + k.length]
    if (/[a-z0-9]/.test(before) || /[a-z0-9]/.test(after)) continue
    return f
  }
  return null
}

const RECENT_DAYS = 14

// Where the matched game sits for this user, plus the library row itself when we
// have one. The row is what lets the card open the OWNED sheet (playtime,
// achievements) instead of the discover sheet, and what feeds the "because" line.
//
// tier orders the For you section: actively played beats owned beats wanted
// beats merely available. 0 means the story has no personal hook at all.
export function resolveGame(item, sets) {
  const empty = { status: null, row: null, tier: 0, why: null, qty: null }
  if (!item) return empty
  const { libIndex, wishlistIds, gamepassIds } = sets || {}
  const id = Number(item.gameIgdbId) || 0
  const daysSince = (row) => {
    const played = row?.last_played ? new Date(row.last_played).getTime() : 0
    return played ? Math.floor((Date.now() - played) / 86400000) : Infinity
  }

  const row =
    (libIndex && id && libIndex.byId.get(id)) ||
    (libIndex && item.gameName && libIndex.byTitle.get(normTitle(item.gameName))) ||
    null

  if (row) {
    const days = daysSince(row)
    if (days <= RECENT_DAYS) {
      return {
        status: 'library',
        row,
        tier: 5,
        why: `Because you're playing ${row.title}`,
        qty: [row.playtime_label, playedWhen(days)].filter(Boolean).join(' · '),
      }
    }
    return { status: 'library', row, tier: 3, why: 'In your library', qty: row.playtime_label || null }
  }

  // No exact game, but the headline may still be about a series in the library.
  // This is the case the tab used to miss entirely: a story about Persona 1 and
  // 2 names no game you own, while Persona 5 Royal is the thing you played today.
  //
  // Checked BEFORE wishlist and Game Pass when the series is one you are
  // actively playing, because "the series you are mid-playthrough of" is a
  // stronger hook than "a game you might buy".
  const fr = libIndex && franchiseHit(item, libIndex.franchiseList)
  if (fr) {
    const days = daysSince(fr.row)
    if (days <= RECENT_DAYS) {
      return {
        status: 'library',
        row: fr.row,
        tier: 4,
        why: `From the ${fr.name} series`,
        qty: `you're playing ${fr.row.title} · ${playedWhen(days)}`,
      }
    }
    if (id && wishlistIds && wishlistIds.has(id)) {
      return { status: 'wishlist', row: null, tier: 2, why: 'On your wishlist', qty: null }
    }
    return {
      status: 'library',
      row: fr.row,
      tier: 2,
      why: `From the ${fr.name} series`,
      qty: `you own ${fr.row.title}`,
    }
  }

  if (id && wishlistIds && wishlistIds.has(id)) {
    return { status: 'wishlist', row: null, tier: 2, why: 'On your wishlist', qty: null }
  }
  if (id && gamepassIds && gamepassIds.has(id)) {
    return { status: 'gamepass', row: null, tier: 1, why: 'Playable now', qty: 'on your Game Pass' }
  }
  return empty
}

function playedWhen(days) {
  if (days <= 0) return 'played today'
  if (days === 1) return 'played yesterday'
  return `played ${days} days ago`
}

// Unique outlets behind a story. Real signal (a story every outlet ran is a
// bigger story), but only worth showing above two: on a typical week most rows
// have one source and a "1 outlet" chip on every card says nothing.
export const OUTLET_CHIP_MIN = 3

export function outletCount(sources) {
  return dedupeSources(sources).length
}

// Newest story first.
//
// Deliberately NOT by `rank`. Rank is assigned within a single curation pass, so
// it only compares stories the same run ranked against each other. Now that a
// refresh appends to the week instead of replacing it, a week can hold several
// runs each numbered from zero, and sorting on rank interleaves them into an
// order that means nothing. published_at is the one field that stays comparable
// across runs. created_at breaks the tie for a story with no publish date, so
// undated rows land next to the run that fetched them rather than at the end.
export function byNewest(a, b) {
  const at = a.publishedAt || a.createdAt || ''
  const bt = b.publishedAt || b.createdAt || ''
  if (at !== bt) return at < bt ? 1 : -1
  return (a.rank ?? 0) - (b.rank ?? 0)
}

// How many stories a week renders before it asks. Nothing is deleted - the cap
// is purely what is on screen, so a story pushed below the fold by later
// refreshes is one tap away rather than gone.
export const WEEK_VISIBLE = 6

// Split a week into the stories that touch this library and the rest.
//
// For you is ordered by relevance, then by how widely the story was covered,
// then by recency. Everything else is simply newest first: with no personal
// hook to rank on, "what happened most recently" is the only honest order.
export function splitForYou(items, sets) {
  const forYou = []
  const also = []
  for (const item of items || []) {
    const rel = resolveGame(item, sets)
    const entry = { item, rel }
    if (rel.tier > 0) forYou.push(entry)
    else also.push(entry)
  }
  forYou.sort(
    (a, b) =>
      b.rel.tier - a.rel.tier ||
      outletCount(b.item.sources) - outletCount(a.item.sources) ||
      byNewest(a.item, b.item),
  )
  also.sort((a, b) => byNewest(a.item, b.item))
  return { forYou, also }
}

// --- Per-story read state --------------------------------------------------
// Keyed on primary_url, NOT on news.id. The digest rewrites its week in place,
// so ids are not stable across runs and id-keyed marks would silently reset.
// The url is what the story actually points at and survives a re-run.

const READ_KEY = 'gamedeck_news_read_v1'
const READ_EVENT = 'gd-news-read'
// Four weeks of digests is well under this; the cap only stops the list growing
// without bound over years. Oldest entries drop first.
const READ_CAP = 300

function loadRead() {
  try {
    const raw = JSON.parse(localStorage.getItem(READ_KEY) || '[]')
    return new Set(Array.isArray(raw) ? raw : [])
  } catch {
    return new Set()
  }
}

export function markRead(url) {
  if (!url) return
  const set = loadRead()
  if (set.has(url)) return
  const next = [...set, url].slice(-READ_CAP)
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(next))
  } catch {
    // ignore storage failures
  }
  window.dispatchEvent(new Event(READ_EVENT))
}

export function useReadNews() {
  const [read, setRead] = useState(loadRead)
  useEffect(() => {
    const sync = () => setRead(loadRead())
    window.addEventListener(READ_EVENT, sync)
    return () => window.removeEventListener(READ_EVENT, sync)
  }, [])
  return read
}

// --- Unread signal on the News tab -----------------------------------------
// A tab-level "there is something new" dot.
//
// This compares the newest created_at, not the newest week_of. A mid-week
// refresh ADDS rows to the current week rather than replacing it, so week_of
// does not move and a week-based comparison would never light the dot for
// stories that arrived between Sundays.

export function getSeenStamp() {
  try {
    return localStorage.getItem(SEEN_KEY) || ''
  } catch {
    return ''
  }
}

export function markNewsSeen(stamp) {
  if (!stamp) return
  try {
    if ((localStorage.getItem(SEEN_KEY) || '') >= stamp) return
    localStorage.setItem(SEEN_KEY, stamp)
  } catch {
    // ignore storage failures
  }
  window.dispatchEvent(new Event(SEEN_EVENT))
}

export async function fetchLatestStamp() {
  const { data, error } = await supabase
    .from('news')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error || !data || !data.length) return ''
  return data[0].created_at || ''
}

// Newest created_at across the rows already in hand, so the tab can mark itself
// seen without a second round trip.
export function newestStamp(rows) {
  let best = ''
  for (const r of rows || []) {
    const s = r.createdAt || ''
    if (s > best) best = s
  }
  return best
}

// Boolean hook: true when the table holds something newer than the user has
// seen. Recomputed whenever markNewsSeen fires.
export function useNewsUnread() {
  const [unread, setUnread] = useState(false)

  useEffect(() => {
    let alive = true
    const check = async () => {
      const latest = await fetchLatestStamp()
      if (!alive) return
      setUnread(Boolean(latest) && latest > getSeenStamp())
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
