export const DAILY_DECK_SIZE = 12
export const CONTINUATION_DECK_SIZE = 6

const STORAGE_KEY = 'gamedeck_for_you_deck_v1'

function storageOrNull(storage) {
  if (storage !== undefined) return storage
  return typeof localStorage === 'undefined' ? null : localStorage
}

export function recommendationDeckDay(now = Date.now()) {
  const date = new Date(now)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function recommendationDeckScope({ platform = '', scale = '', lane = '', hideOwned = false } = {}) {
  return [platform || 'all-platforms', scale || 'all-scales', lane || 'all-tastes', hideOwned ? 'hide-owned' : 'include-owned'].join('|')
}

export function loadRecommendationDeck(scope, now = Date.now(), storage) {
  const source = storageOrNull(storage)
  if (!source) return null
  try {
    const container = JSON.parse(source.getItem(STORAGE_KEY) || 'null')
    const day = recommendationDeckDay(now)
    const saved = container?.sessions?.[`${day}::${scope}`]
    if (!saved) return null
    if (!Array.isArray(saved.ids) || !saved.ids.length) return null
    const ids = saved.ids.map(String).filter(Boolean)
    const at = Math.max(0, Math.min(ids.length, Number(saved.at) || 0))
    const batchNumber = Math.max(0, Number(saved.batchNumber) || 0)
    const currentId = saved.currentId == null ? null : String(saved.currentId)
    const kinds = saved.kinds && typeof saved.kinds === 'object' ? saved.kinds : {}
    return { ids, at, batchNumber, currentId, kinds }
  } catch {
    return null
  }
}

export function saveRecommendationDeck({ scope, games, at, batchNumber = 0 }, now = Date.now(), storage) {
  const target = storageOrNull(storage)
  if (!target || !scope) return false
  const ids = (games || []).map((game) => String(game?.id ?? game?.igdb_id ?? '')).filter(Boolean)
  if (!ids.length) return false
  try {
    const day = recommendationDeckDay(now)
    let container = null
    try {
      container = JSON.parse(target.getItem(STORAGE_KEY) || 'null')
    } catch {
      container = null
    }
    const sessions = {}
    for (const [key, value] of Object.entries(container?.sessions || {})) {
      if (key.startsWith(`${day}::`)) sessions[key] = value
    }
    sessions[`${day}::${scope}`] = {
      ids,
      kinds: Object.fromEntries((games || []).map((game) => [
        String(game?.id ?? game?.igdb_id ?? ''),
        String(game?.recommendationKind || 'strong'),
      ]).filter(([id]) => Boolean(id))),
      at: Math.max(0, Math.min(ids.length, Number(at) || 0)),
      batchNumber: Math.max(0, Number(batchNumber) || 0),
      currentId: Number(at) >= ids.length ? null : (ids[Math.max(0, Number(at) || 0)] || null),
    }
    target.setItem(STORAGE_KEY, JSON.stringify({ sessions }))
    return true
  } catch {
    return false
  }
}

export function restoreRecommendationDeck(saved, candidates, fallback = []) {
  if (!saved) return null
  const byId = new Map()
  for (const game of candidates || []) {
    const id = String(game?.id ?? game?.igdb_id ?? '')
    if (id && !byId.has(id)) byId.set(id, game)
  }
  const restored = saved.ids
    .map((id) => {
      const game = byId.get(String(id))
      return game ? { ...game, recommendationKind: saved.kinds?.[String(id)] || game.recommendationKind } : null
    })
    .filter(Boolean)
  const targetSize = saved.ids.length
  const seen = new Set(restored.map((game) => String(game.id ?? game.igdb_id)))
  for (const game of fallback || []) {
    if (restored.length >= targetSize) break
    const id = String(game?.id ?? game?.igdb_id ?? '')
    if (!id || seen.has(id)) continue
    seen.add(id)
    restored.push(game)
  }
  if (!restored.length) return null
  return {
    games: restored,
    at: saved.currentId && restored.some((game) => String(game.id ?? game.igdb_id) === saved.currentId)
      ? restored.findIndex((game) => String(game.id ?? game.igdb_id) === saved.currentId)
      : Math.min(restored.length, saved.at),
    batchNumber: saved.batchNumber,
  }
}
