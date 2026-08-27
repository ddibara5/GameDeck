import { supabase } from './supabase.js'

const SESSION_KEY = 'gamedeck_recommendation_session_v1'
export const RECOMMENDATION_MODEL_VERSION = 'for_you_v3'

const exposureIdByKey = new Map()
const exposureKeyByGame = new Map()
const pendingByKey = new Map()

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function recommendationSessionId() {
  if (typeof sessionStorage === 'undefined') return randomId()
  try {
    const current = sessionStorage.getItem(SESSION_KEY)
    if (current) return current
    const next = randomId()
    sessionStorage.setItem(SESSION_KEY, next)
    return next
  } catch {
    return randomId()
  }
}

const sessionId = recommendationSessionId()

function gameId(game) {
  return Number(game && (game.id ?? game.igdb_id)) || 0
}

function cleanText(value, max) {
  return String(value || '').trim().slice(0, max)
}

export function recommendationExposureRow(
  game,
  { lane, position, surface = 'for_you', reason = '' } = {},
  stableSessionId = sessionId,
) {
  const igdbId = gameId(game)
  const laneKey = cleanText(lane?.key || game?.lane?.key || 'new', 80) || 'new'
  if (!igdbId) return null
  return {
    // One opportunity per game/surface/session. If the lightweight New lane
    // paints first and the taste lanes claim the same game moments later, the
    // first visible attribution is retained instead of counting two exposures.
    exposure_key: `${stableSessionId}:${surface}:${RECOMMENDATION_MODEL_VERSION}:${igdbId}`.slice(0, 180),
    igdb_id: igdbId,
    title: cleanText(game?.name || game?.title || 'Untitled', 300) || 'Untitled',
    surface,
    lane_key: laneKey,
    position: Math.max(1, Math.min(50, Number(position) || 1)),
    model_version: RECOMMENDATION_MODEL_VERSION,
    context: reason ? { reason: cleanText(reason, 180) } : {},
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

// One batch per visible feed. The session-scoped exposure key means filter-chip
// changes and repeat renders do not inflate the evidence, while a later app
// session is counted as a genuinely new recommendation opportunity.
export function trackRecommendationFeed(feed) {
  const rows = (feed || []).map((game, index) => recommendationExposureRow(game, {
    lane: game.lane,
    position: index + 1,
    reason: game.recommendationReason,
  })).filter(Boolean)
  if (!rows.length) return Promise.resolve([])

  for (const row of rows) exposureKeyByGame.set(String(row.igdb_id), row.exposure_key)
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
  const row = recommendationExposureRow(game, context)
  if (!row) return null
  exposureKeyByGame.set(String(row.igdb_id), row.exposure_key)
  const knownKey = exposureKeyByGame.get(String(row.igdb_id)) || row.exposure_key
  const pending = pendingByKey.get(knownKey)
  if (pending) await pending
  if (!exposureIdByKey.has(knownKey)) await persistExposureRows([row])
  return exposureIdByKey.get(knownKey) || null
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
