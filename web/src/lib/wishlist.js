// Cross-device wishlist, backed by the Supabase `wishlist` table (anon RLS).
// Mirrors the userStatus.js pattern: a module-level cache plus a change event,
// so every heart/rail/view stays in sync without prop drilling.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'
import { normTitle } from './discover.js'

const EVENT = 'gd-wishlist-change'
const BASE_COLUMNS = 'igdb_id, title, cover, year, note, created_at'
// Release date + precision are added by a later migration. Select them when present
// and fall back to the base columns if the migration hasn't run yet, so the wishlist
// never breaks. Rows keep working with just `year` until the refresh job fills these.
const DATE_COLUMNS = 'released, date_precision, release_label, last_synced'
const FULL_COLUMNS = `${BASE_COLUMNS}, ${DATE_COLUMNS}`
const MISSING_DATE_COL = /released|date_precision|release_label|last_synced/i

let cache = null // array of rows once loaded, else null
let inflight = null

function emit() {
  window.dispatchEvent(new Event(EVENT))
}

function gameId(game) {
  return Number(game && (game.id != null ? game.id : game.igdb_id)) || 0
}

export async function loadWishlist(force = false) {
  if (cache && !force) return cache
  if (inflight && !force) return inflight
  const run = (cols) =>
    supabase.from('wishlist').select(cols).order('created_at', { ascending: false })
  inflight = run(FULL_COLUMNS).then(async (res) => {
    let { data, error } = res
    if (error && MISSING_DATE_COL.test(error.message || '')) {
      const r2 = await run(BASE_COLUMNS)
      data = r2.data
      error = r2.error
    }
    inflight = null
    if (error) return cache || []
    cache = data || []
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
  cache = [{ ...dated, note: null, created_at: new Date().toISOString() }, ...(cache || []).filter((r) => r.igdb_id !== id)]
  emit()
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
  cache = (cache || []).filter((r) => r.igdb_id !== key)
  emit()
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
  cache = [full, ...(cache || []).filter((r) => r.igdb_id !== key)].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
  )
  emit()
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
  cache = list.filter((r) => !ids.includes(r.igdb_id))
  emit()
  await supabase.from('wishlist').delete().in('igdb_id', ids)
  return removed
}

// Live wishlist for components: rows, an id Set for quick membership, and loading.
export function useWishlist() {
  const [items, setItems] = useState(cache || [])
  const [loading, setLoading] = useState(cache == null)

  useEffect(() => {
    let alive = true
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
  }, [])

  const ids = useMemo(() => new Set(items.map((r) => r.igdb_id)), [items])
  return { items, ids, loading }
}
