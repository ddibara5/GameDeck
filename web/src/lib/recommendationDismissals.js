import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'
import { idbSet, swr } from './idbCache.js'

const EVENT = 'gd-recommendation-dismissal-change'
const CACHE_KEY = 'recommendation:dismissals:v1'

let cache = null
let inflight = null

function emit() {
  window.dispatchEvent(new Event(EVENT))
}

function setCache(rows) {
  cache = rows
  idbSet(CACHE_KEY, rows)
  emit()
}

async function fetchDismissals() {
  const { data, error } = await supabase
    .from('recommendation_dismissals')
    .select('igdb_id,title,dismissed_at')
    .order('dismissed_at', { ascending: false })
  if (error) throw new Error(error.message || 'Could not load hidden recommendations')
  return data || []
}

export async function loadRecommendationDismissals(force = false) {
  if (cache && !force) return cache
  if (force) {
    const rows = await fetchDismissals().catch(() => cache || [])
    setCache(rows)
    return cache
  }
  if (inflight) return inflight
  inflight = swr(CACHE_KEY, fetchDismissals, {
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

export async function dismissRecommendation(game) {
  const igdbId = Number(game?.id ?? game?.igdb_id) || 0
  if (!igdbId) return false
  const previous = cache || []
  const row = {
    igdb_id: igdbId,
    title: game?.name || game?.title || 'Untitled',
    dismissed_at: new Date().toISOString(),
  }
  setCache([row, ...previous.filter((item) => item.igdb_id !== igdbId)])
  const { error } = await supabase
    .from('recommendation_dismissals')
    .upsert(row, { onConflict: 'igdb_id', ignoreDuplicates: true })
  if (!error) return true
  setCache(previous)
  return false
}

export async function restoreRecommendation(id) {
  const igdbId = Number(id) || 0
  if (!igdbId) return false
  const previous = cache || []
  setCache(previous.filter((item) => item.igdb_id !== igdbId))
  const { error } = await supabase
    .from('recommendation_dismissals')
    .delete()
    .eq('igdb_id', igdbId)
  if (!error) return true
  setCache(previous)
  return false
}

export function useRecommendationDismissals() {
  const [items, setItems] = useState(cache || [])
  const [loading, setLoading] = useState(cache == null)

  useEffect(() => {
    let alive = true
    loadRecommendationDismissals().then((rows) => {
      if (!alive) return
      setItems(rows)
      setLoading(false)
    })
    const handler = () => alive && setItems(cache || [])
    window.addEventListener(EVENT, handler)
    return () => {
      alive = false
      window.removeEventListener(EVENT, handler)
    }
  }, [])

  const ids = useMemo(() => new Set(items.map((row) => row.igdb_id)), [items])
  return { items, ids, loading }
}
