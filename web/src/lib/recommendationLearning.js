import { supabase } from './supabase.js'

export const RECOMMENDATION_MODEL_VERSION = 'for_you_v4'

const exposureIdByKey = new Map()
const exposureKeyByGame = new Map()
const exposureRowByKey = new Map()
const pendingByKey = new Map()

function gameId(game) {
  return Number(game && (game.id ?? game.igdb_id)) || 0
}

function cleanText(value, max) {
  return String(value || '').trim().slice(0, max)
}

export function recommendationExposureRow(
  game,
  { lane, position, surface = 'for_you', reason = '', batchId = '' } = {},
) {
  const igdbId = gameId(game)
  const laneKey = cleanText(lane?.key || game?.lane?.key || 'new', 80) || 'new'
  const batch = cleanText(batchId, 40)
  if (!igdbId) return null
  return {
    // One opportunity per game/surface/generated deck. Daily and ten-minute
    // refresh batch ids stay stable across app relaunches, so navigating back to
    // For You or pulling repeatedly cannot manufacture dozens of ignores.
    exposure_key: `${surface}:${RECOMMENDATION_MODEL_VERSION}:${batch || 'initial'}:${igdbId}`.slice(0, 180),
    igdb_id: igdbId,
    title: cleanText(game?.name || game?.title || 'Untitled', 300) || 'Untitled',
    surface,
    lane_key: laneKey,
    position: Math.max(1, Math.min(50, Number(position) || 1)),
    model_version: RECOMMENDATION_MODEL_VERSION,
    context: {
      ...(reason ? { reason: cleanText(reason, 180) } : {}),
      ...(batch ? { batch } : {}),
    },
  }
}

async function persistExposureRows(rows) {
  if (!rows.length) return []
  const keys = rows.map((row) => row.exposure_key)
  const { error: insertError } = await supabase
    .from('recommendation_exposures')
    .upsert(rows, { onConflict: 'exposure_key', ignoreDuplicates: true })
  if (insertError) throw new Error(insertError.message || 'Could not record recommendations')

  const { data, error } = await supabase
    .from('recommendation_exposures')
    .select('id,exposure_key,igdb_id')
    .in('exposure_key', keys)
  if (error) throw new Error(error.message || 'Could not resolve recommendations')
  for (const row of data || []) exposureIdByKey.set(row.exposure_key, row.id)
  return data || []
}

// One exposure per game in each deliberately generated feed. The batch id stays
// stable while taste chips change, so filtering and rerenders do not inflate the
// evidence; a manual refresh receives a new id because it is a new opportunity.
export function trackRecommendationFeed(feed, { batchId = 'initial' } = {}) {
  const rows = (feed || []).map((game, index) => recommendationExposureRow(game, {
    lane: game.lane,
    position: index + 1,
    reason: game.recommendationReason,
    batchId,
  })).filter(Boolean)
  if (!rows.length) return Promise.resolve([])

  for (const row of rows) {
    exposureKeyByGame.set(String(row.igdb_id), row.exposure_key)
    exposureRowByKey.set(row.exposure_key, row)
  }
  const request = persistExposureRows(rows).catch(() => [])
  for (const row of rows) pendingByKey.set(row.exposure_key, request)
  request.finally(() => {
    for (const row of rows) {
      if (pendingByKey.get(row.exposure_key) === request) pendingByKey.delete(row.exposure_key)
    }
  })
  return request
}

async function ensureExposure(game, context) {
  const igdbId = gameId(game)
  if (!igdbId) return null
  const knownKey = exposureKeyByGame.get(String(igdbId))
  const row = knownKey ? exposureRowByKey.get(knownKey) : recommendationExposureRow(game, context)
  if (!row) return null
  if (!knownKey) {
    exposureKeyByGame.set(String(row.igdb_id), row.exposure_key)
    exposureRowByKey.set(row.exposure_key, row)
  }
  const resolvedKey = knownKey || row.exposure_key
  const pending = pendingByKey.get(resolvedKey)
  if (pending) await pending
  if (!exposureIdByKey.has(resolvedKey)) await persistExposureRows([row])
  return exposureIdByKey.get(resolvedKey) || null
}

// Learning must never delay opening a game sheet. This deliberately returns
// void and contains its own error boundary; Supabase remains the durable source
// when it is available, while recommendation navigation stays fully functional
// during an outage or expired session.
export function recordRecommendationDetailOpen(game, context) {
  ensureExposure(game, context)
    .then(async (exposureId) => {
      if (!exposureId) return
      await supabase
        .from('recommendation_interactions')
        .upsert(
          { exposure_id: exposureId, event_type: 'detail_open' },
          { onConflict: 'exposure_id,event_type', ignoreDuplicates: true },
        )
    })
    .catch(() => {})
}
