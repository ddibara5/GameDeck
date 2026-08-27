import { buildTasteProfile, derivedEvidenceStatus } from '../src/lib/gameIntelligence.js'

const DAY_MS = 24 * 60 * 60 * 1000

function clean(value) {
  return String(value == null ? '' : value).replace(/[\r\n|]+/g, ' ').trim()
}

function restUrl(base, table, params) {
  const url = new URL(`/rest/v1/${table}`, base)
  for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value)
  return url.toString()
}

async function rowsOrEmpty(response) {
  if (!response.ok) return []
  const rows = await response.json()
  return Array.isArray(rows) ? rows : []
}

function hours(minutes) {
  return Math.round((Math.max(0, Number(minutes) || 0) / 60) * 10) / 10
}

function releaseDate(value) {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return 'date unknown'
  return new Date(seconds * 1000).toISOString().slice(0, 10)
}

export function buildGameEvidenceContext({ games, ranks, statuses, activity, wishlist, gamepass, now = Date.now() }) {
  const profile = buildTasteProfile({ games, ranks, activity, wishlist })
  const statusByGame = new Map((statuses || []).map((row) => [String(row.master_id), row.status]))
  const gameById = new Map((games || []).map((game) => [String(game.master_id), game]))
  const rankByGame = new Map((ranks || []).map((rank) => [String(rank.master_id), rank]))
  let backlogCount = 0

  const libraryLines = (games || []).map((game) => {
    const explicit = statusByGame.get(String(game.master_id)) || null
    const status = derivedEvidenceStatus(game, explicit, now)
    if (status === 'backlog') backlogCount += 1
    const rank = rankByGame.get(String(game.master_id))
    const rankText = rank
      ? ` | MY-RANK ${Math.round(Number(rank.score) || 0)} (${clean(rank.reaction)}, ${Number(rank.comparison_count) || 0} comparisons)`
      : ''
    const platform = { xbox: 'Xbox', psn: 'PlayStation', steam: 'PC' }[game.environment] || clean(game.environment) || 'platform unknown'
    const played = game.last_played ? String(game.last_played).slice(0, 10) : 'never'
    return `${clean(game.title)} | ${platform} | ${status.toUpperCase()}${explicit ? ' (chosen)' : ' (derived)'} | ${Math.round(Number(game.percent) || 0)}% | ${hours(game.playtime_minutes)}h | last ${played}${rankText}`
  })

  const recentLines = [...profile.rows]
    .filter((game) => game.recent_minutes > 0)
    .sort((a, b) => Date.parse(b.recent_last_played || '') - Date.parse(a.recent_last_played || '') || b.recent_minutes - a.recent_minutes)
    .slice(0, 50)
    .map((game) => {
      const rank = game.personalRank?.reaction ? ` | reaction ${clean(game.personalRank.reaction)}` : ''
      return `${clean(game.title)} | ${hours(game.recent_minutes)}h across ${game.recent_active_days} days | last ${String(game.recent_last_played || '').slice(0, 10)}${rank}`
    })

  // Include activity rows that no longer join to the current library only as an
  // aggregate count, never as ownership evidence.
  const knownRecentIds = new Set(profile.rows.filter((game) => game.recent_minutes > 0).map((game) => String(game.master_id)))
  const unmatchedRecent = new Set((activity || []).map((row) => String(row.master_id)).filter((id) => id && !knownRecentIds.has(id) && !gameById.has(id))).size

  const wishlistLines = (wishlist || []).slice(0, 200).map((game) => {
    const note = game.note ? ` | note ${clean(game.note)}` : ''
    return `${clean(game.title)} | release ${releaseDate(game.released)}${note}`
  })

  const gamePassLines = (gamepass || [])
    .sort((a, b) => Number(Boolean(b.leaving_soon)) - Number(Boolean(a.leaving_soon)) || (Number(b.rating) || 0) - (Number(a.rating) || 0))
    .slice(0, 600)
    .map((game) => `${clean(game.name)}${game.leaving_soon ? ' | LEAVING SOON' : ''}`)
  const gamePassUpdated = (gamepass || [])
    .map((game) => Date.parse(game.updated_at || ''))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0]

  const evidence = profile.evidence
  const sections = [
    `EVIDENCE SUMMARY\nRecent window: 90 days | ${evidence.recentGameCount} library games | ${hours(evidence.recentMinutes)}h | ${evidence.activeDayCount} active days | ${evidence.rankedGameCount} ranked games | ${evidence.wishlistCount} wishlist saves${unmatchedRecent ? ` | ${unmatchedRecent} unmatched activity ids` : ''}`,
    `LIBRARY - authoritative ownership list\n${games?.length || 0} owned games | ${backlogCount} currently classified backlog\nFormat: Title | Platform | Status | Completion | Lifetime hours | Last played | Optional rank\n${libraryLines.join('\n') || '(empty)'}`,
    `RECENT ACTIVITY - strongest behavioral taste signal\n${recentLines.join('\n') || '(no activity in the last 90 days)'}`,
    `WISHLIST - explicit interest, not ownership\n${wishlistLines.join('\n') || '(empty)'}`,
    `GAME PASS CURRENT SNAPSHOT - availability evidence, not ownership${gamePassUpdated ? ` | updated ${new Date(gamePassUpdated).toISOString()}` : ''}\n${gamePassLines.join('\n') || '(unavailable)'}`,
  ]
  return sections.join('\n\n')
}

export async function loadGameEvidence(req) {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!base || !key) throw new Error('Supabase env vars are not configured.')

  const headers = { apikey: key, Authorization: req.headers.authorization }
  const since = new Date(Date.now() - 90 * DAY_MS).toISOString().slice(0, 10)
  const requests = [
    fetch(restUrl(base, 'games', {
      select: 'master_id,title,environment,percent,playtime_minutes,earned_awards,total_awards,last_played,length_minutes',
      order: 'last_played.desc.nullslast',
      limit: '5000',
    }), { headers }),
    fetch(restUrl(base, 'game_ranks', { select: 'master_id,score,reaction,comparison_count' }), { headers }),
    fetch(restUrl(base, 'game_status', { select: 'master_id,status' }), { headers }),
    fetch(restUrl(base, 'v_recent_activity', {
      select: 'master_id,title,event_date,minutes_delta,achievements_delta',
      event_date: `gte.${since}`,
      order: 'event_date.desc',
      limit: '1000',
    }), { headers }),
    fetch(restUrl(base, 'wishlist', { select: 'igdb_id,title,released,note', order: 'created_at.desc', limit: '200' }), { headers }),
    fetch(restUrl(base, 'gamepass', { select: 'igdb_id,name,rating,leaving_soon,updated_at', limit: '600' }), { headers }),
  ]
  const [gameRes, ...optional] = await Promise.all(requests)
  if (!gameRes.ok) throw new Error(`Supabase library read failed: ${gameRes.status}`)
  const games = await gameRes.json()
  const [ranks, statuses, activity, wishlist, gamepass] = await Promise.all(optional.map(rowsOrEmpty))
  return buildGameEvidenceContext({ games, ranks, statuses, activity, wishlist, gamepass })
}
