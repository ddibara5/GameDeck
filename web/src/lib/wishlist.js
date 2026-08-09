// Cross-device wishlist, backed by the Supabase `wishlist` table (anon RLS).
// Mirrors the userStatus.js pattern: a module-level cache plus a change event,
// so every heart/rail/view stays in sync without prop drilling.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'
import { normTitle } from './discover.js'

const EVENT = 'gd-wishlist-change'
const COLUMNS = 'igdb_id, title, cover, year, note, created_at'

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
  inflight = supabase
    .from('wishlist')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .then(({ data, error }) => {
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
  const row = {
    igdb_id: id,
    title: game.name || game.title || 'Untitled',
    cover: game.cover || null,
    year: game.year || null,
  }
  // Optimistic: update the cache and notify immediately, reconcile on error.
  cache = [{ ...row, note: null, created_at: new Date().toISOString() }, ...(cache || []).filter((r) => r.igdb_id !== id)]
  emit()
  const { error } = await supabase.from('wishlist').upsert(row, { onConflict: 'igdb_id' })
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
