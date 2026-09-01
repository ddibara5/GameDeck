// Cross-device wishlist, backed by the Supabase `wishlist` table (anon RLS).
// Mirrors the userStatus.js pattern: a module-level cache plus a change event,
// so every heart/rail/view stays in sync without prop drilling.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'
import { normTitle } from './discover.js'
import { swr, idbSet } from './idbCache.js'

const EVENT = 'gd-wishlist-change'
const BASE_COLUMNS = 'igdb_id, title, cover, year, note, created_at'
// Release date + precision are added by a later migration. Select them when present
// and fall back to the base columns if the migration hasn't run yet, so the wishlist
// never breaks. Rows keep working with just `year` until the refresh job fills these.
const DATE_COLUMNS = 'released, date_precision, release_label, last_synced'
const FULL_COLUMNS = `${BASE_COLUMNS}, ${DATE_COLUMNS}`
const MISSING_DATE_COL = /released|date_precision|release_label|last_synced/i

const CACHE_KEY = 'wishlist:rows'

let cache = null // array of rows once loaded, else null
let inflight = null

function emit() {
  window.dispatchEvent(new Event(EVENT))
}

// One place owns `cache`, and it also writes to disk.
//
// Every mutation below used to do `cache = ...; emit()`. That is still what
// happens, but the row set is now persisted too, so the next launch paints the
// wishlist you actually have rather than the one from before your last edit and
// then correcting a beat later.
function setCache(rows) {
  cache = rows
  idbSet(CACHE_KEY, rows)
  emit()
}

function gameId(game) {
  return Number(game && (game.id != null ? game.id : game.igdb_id)) || 0
}

// The network read, with the column fallback. Throws rather than returning an
// empty list on error, so swr() keeps whatever is on disk instead of caching a
// failure as if it were an empty wishlist.
async function fetchWishlist() {
  const run = (cols) =>
    supabase.from('wishlist').select(cols).order('created_at', { ascending: false })
  let { data, error } = await run(FULL_COLUMNS)
  if (error && MISSING_DATE_COL.test(error.message || '')) {
    ;({ data, error } = await run(BASE_COLUMNS))
  }
  if (error) throw new Error(error.message || 'Wishlist request failed')
  return data || []
}

// Local-first, like the library.
//
// This used to be a straight network read on every launch, with nothing on disk
// behind it, so the hearts and the Coming up card held a placeholder for a full
// round trip. Measured on Dave's machine that round trip is ~420ms, of which the
// server accounts for 11ms - the rest is getting there and back. maxAge 0, so a
// cached list is always served immediately AND always revalidated: the wishlist
// changes from other devices and a stale one must not stick.
export async function loadWishlist(force = false) {
  if (cache && !force) return cache
  if (force) {
    const rows = await fetchWishlist().catch(() => cache || [])
    setCache(rows)
    return cache
  }
  if (inflight) return inflight
  inflight = swr(CACHE_KEY, fetchWishlist, {
    maxAge: 0,
    onFresh: (rows) => setCache(rows),
  })
    .then(({ value }) => {
      cache = value || []
      inflight = null
      return cache
    })
    .catch(() => {
      inflight = null
      cache = cache || []
      return cache
    })
  return inflight
}

export function isWishlisted(id) {
  const key = Number(id)
  return (cache || []).some((r) => r.igdb_id === key)
}

export async function addToWishlist(game) {
  const id = gameId(game)
  if (!id) return
  const rel = game.release || null
  const base = {
    igdb_id: id,
    title: game.name || game.title || 'Untitled',
    cover: game.cover || null,
    year: game.year || null,
  }
  // Store the release date + precision when the source game carries it (games from
  // Discover / the game sheet do); the weekly refresh backfills anything missing.
  const dated = {
    ...base,
    released: rel && rel.ts != null ? rel.ts : null,
    date_precision: rel && rel.precision ? rel.precision : null,
    release_label: rel && rel.label ? rel.label : null,
  }
  // Optimistic: update the cache and notify immediately, reconcile on error.
  setCache([{ ...dated, note: null, created_at: new Date().toISOString() }, ...(cache || []).filter((r) => r.igdb_id !== id)])
  let { error } = await supabase.from('wishlist').upsert(dated, { onConflict: 'igdb_id' })
  if (error && MISSING_DATE_COL.test(error.message || '')) {
    ;({ error } = await supabase.from('wishlist').upsert(base, { onConflict: 'igdb_id' }))
  }
  if (error) {
    await loadWishlist(true)
    emit()
  }
}

export async function removeFromWishlist(id) {
  const key = Number(id)
  if (!key) return
  setCache((cache || []).filter((r) => r.igdb_id !== key))
  const { error } = await supabase.from('wishlist').delete().eq('igdb_id', key)
  if (error) {
    await loadWishlist(true)
    emit()
  }
}

export function toggleWishlist(game) {
  return isWishlisted(gameId(game)) ? removeFromWishlist(gameId(game)) : addToWishlist(game)
}

// Put a previously-removed row back exactly as it was (id, title, cover, year,
// note, created_at). Used by the wishlist's swipe-to-delete undo so an accidental
// swipe restores the item in its original spot rather than jumping to the top.
export async function restoreToWishlist(row) {
  const key = Number(row && row.igdb_id)
  if (!key) return
  const full = {
    igdb_id: key,
    title: row.title || 'Untitled',
    cover: row.cover ?? null,
    year: row.year ?? null,
    note: row.note ?? null,
    created_at: row.created_at || new Date().toISOString(),
    released: row.released ?? null,
    date_precision: row.date_precision ?? null,
    release_label: row.release_label ?? null,
  }
  setCache(
    [full, ...(cache || []).filter((r) => r.igdb_id !== key)].sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
    ),
  )
  let { error } = await supabase.from('wishlist').upsert(full, { onConflict: 'igdb_id' })
  if (error && MISSING_DATE_COL.test(error.message || '')) {
    const { released, date_precision, release_label, ...base } = full
    ;({ error } = await supabase.from('wishlist').upsert(base, { onConflict: 'igdb_id' }))
  }
  if (error) {
    await loadWishlist(true)
    emit()
  }
}

// Drop any wishlist rows whose title now matches a game in the synced library.
// Returns the removed rows so the caller can surface a small note.
export async function reconcileWishlist(ownedTitleSet) {
  if (!ownedTitleSet || !ownedTitleSet.size) return []
  const list = await loadWishlist()
  const removed = list.filter((r) => ownedTitleSet.has(normTitle(r.title)))
  if (!removed.length) return []
  const ids = removed.map((r) => r.igdb_id)
  setCache(list.filter((r) => !ids.includes(r.igdb_id)))
  await supabase.from('wishlist').delete().in('igdb_id', ids)
  return removed
}

// Live wishlist for components: rows, an id Set for quick membership, and loading.
export function useWishlist(enabled = true) {
  const [items, setItems] = useState(cache || [])
  const [loading, setLoading] = useState(cache == null && enabled)

  useEffect(() => {
    if (!enabled) return undefined
    let alive = true
    if (cache == null) setLoading(true)
    loadWishlist().then((l) => {
      if (!alive) return
      setItems(l)
      setLoading(false)
    })
    const handler = () => alive && setItems(cache || [])
    window.addEventListener(EVENT, handler)
    return () => {
      alive = false
      window.removeEventListener(EVENT, handler)
    }
  }, [enabled])

  const ids = useMemo(() => new Set(items.map((r) => r.igdb_id)), [items])
  return { items, ids, loading }
}
