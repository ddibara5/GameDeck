// Server-safe taste evidence shared by Ask GameDeck tests and the Vercel route.
// Duel outcomes enrich explanations; they never alter lane strength.

const DAY_MS = 24 * 60 * 60 * 1000

export const TASTE_LANES = [
  { key: 'soulslike', label: 'Soulslike', terms: ['soulslike', 'souls like'] },
  { key: 'openworld', label: 'Open world', terms: ['open world'] },
  { key: 'survival', label: 'Survival', terms: ['survival'] },
  { key: 'story', label: 'Story rich', terms: ['story rich'] },
  { key: 'postapoc', label: 'Post-apocalyptic', terms: ['post apocalyptic'] },
  { key: 'horror', label: 'Horror', terms: ['horror', 'survival horror'] },
  { key: 'jrpg', label: 'JRPG', terms: ['jrpg', 'japanese role playing'] },
  { key: 'stealth', label: 'Stealth', terms: ['stealth'] },
  { key: 'metroidvania', label: 'Metroidvania', terms: ['metroidvania'] },
]

const reactions = new Set(['loved', 'liked', 'mixed', 'not_for_me'])

function clamp(value, low = 0, high = 1) {
  return Math.max(low, Math.min(high, value))
}

function finite(value, fallback = 0) {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : fallback
}

function cleanText(value) {
  return String(value == null ? '' : value).replace(/[\r\n|]+/g, ' ').trim()
}

function positiveId(value) {
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  return typeof parsed === 'number' && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function titleKey(value) {
  return normalize(value).replace(
    /\s+(?:(?:game of the year|goty|deluxe|ultimate|definitive|complete|standard|gold|collector s) edition)$/,
    '',
  )
}

function strings(value) {
  if (Array.isArray(value)) return value
  return typeof value === 'string' ? [value] : []
}

function traits(game) {
  return [...new Set([
    ...strings(game?.keywords),
    ...strings(game?.themes),
    ...strings(game?.genres),
    ...strings(game?.genre),
  ].map(normalize).filter(Boolean))]
}

function reaction(value) {
  return reactions.has(value) ? value : null
}

function matchupKey(leftId, rightId) {
  return leftId < rightId ? `${leftId}:${rightId}` : `${rightId}:${leftId}`
}

function parsedComparison(value, sourceIndex) {
  const leftId = positiveId(value?.left_id)
  const rightId = positiveId(value?.right_id)
  const result = value?.result
  const comparedAt = Date.parse(value?.compared_at || '')
  if (
    !leftId ||
    !rightId ||
    leftId === rightId ||
    !['left', 'right', 'skip'].includes(result) ||
    !Number.isFinite(comparedAt)
  ) return null
  return {
    id: positiveId(value?.id),
    leftId,
    rightId,
    result,
    comparedAt,
    sourceIndex,
  }
}

function gameComparison(map, masterId) {
  if (!map.has(masterId)) {
    map.set(masterId, {
      masterId,
      wins: 0,
      losses: 0,
      skips: 0,
      opponents: new Set(),
      defeated: new Set(),
    })
  }
  return map.get(masterId)
}

function winnerAndLoser(row) {
  return row.result === 'left'
    ? { winnerId: row.leftId, loserId: row.rightId }
    : { winnerId: row.rightId, loserId: row.leftId }
}

export function summarizeTasteComparisons(values) {
  const comparisons = []
  let invalidRows = 0
  for (const [sourceIndex, value] of (values || []).entries()) {
    const parsed = parsedComparison(value, sourceIndex)
    if (parsed) comparisons.push(parsed)
    else invalidRows += 1
  }

  const games = new Map()
  const latest = new Map()
  let decidedComparisons = 0
  let skippedComparisons = 0

  for (const row of comparisons) {
    const left = gameComparison(games, row.leftId)
    const right = gameComparison(games, row.rightId)
    if (row.result === 'skip') {
      skippedComparisons += 1
      left.skips += 1
      right.skips += 1
      continue
    }

    decidedComparisons += 1
    const { winnerId, loserId } = winnerAndLoser(row)
    gameComparison(games, winnerId).wins += 1
    gameComparison(games, loserId).losses += 1

    const key = matchupKey(row.leftId, row.rightId)
    const current = latest.get(key)
    if (
      !current ||
      row.comparedAt > current.comparedAt ||
      (row.comparedAt === current.comparedAt &&
        ((row.id && current.id && row.id > current.id) ||
          ((!row.id || !current.id) && row.sourceIndex < current.sourceIndex)))
    ) latest.set(key, row)
  }

  for (const row of latest.values()) {
    const { winnerId, loserId } = winnerAndLoser(row)
    gameComparison(games, winnerId).opponents.add(loserId)
    gameComparison(games, winnerId).defeated.add(loserId)
    gameComparison(games, loserId).opponents.add(winnerId)
  }

  return {
    totalComparisons: comparisons.length,
    decidedComparisons,
    skippedComparisons,
    invalidRows,
    uniqueMatchups: latest.size,
    games: [...games.values()]
      .sort((left, right) => left.masterId - right.masterId)
      .map((game) => ({
        masterId: game.masterId,
        wins: game.wins,
        losses: game.losses,
        skips: game.skips,
        decidedComparisons: game.wins + game.losses,
        uniqueOpponents: game.opponents.size,
        uniqueOpponentsDefeated: game.defeated.size,
      })),
  }
}

export function tasteEvidenceLabel(positiveSourceCount, uniqueMatchups) {
  if (positiveSourceCount >= 3 && uniqueMatchups >= 15) return 'Well-supported'
  if (positiveSourceCount >= 2 && uniqueMatchups >= 5) return 'Developing evidence'
  return 'Early evidence'
}

function laneKeysForTraits(values) {
  return TASTE_LANES
    .filter((lane) => values.some((value) =>
      lane.terms.some((term) => value === term || value.startsWith(`${term} `)),
    ))
    .map((lane) => lane.key)
}

export function buildTasteEvidenceProfile({
  games = [],
  ranks = [],
  activity = [],
  comparisons = [],
  coverage = {},
  now = Date.now(),
} = {}) {
  const rankByGame = new Map((ranks || []).flatMap((row) => {
    const id = positiveId(row?.master_id)
    return id ? [[String(id), row]] : []
  }))
  const comparisonSummary = summarizeTasteComparisons(comparisons)
  const duelByGame = new Map(comparisonSummary.games.map((game) => [game.masterId, game]))

  const recent = new Map()
  const seenActivity = new Set()
  for (const row of (activity || []).slice(0, 500)) {
    const id = positiveId(row?.master_id)
    const at = Date.parse(row?.event_date || '')
    const key = `${id}:${row?.event_date}:${row?.environment}`
    if (!id || !Number.isFinite(at) || at > now || now - at > 90 * DAY_MS || seenActivity.has(key)) continue
    seenActivity.add(key)
    const minutes = clamp(finite(row?.minutes_delta), 0, 1440)
    recent.set(String(id), (recent.get(String(id)) || 0) + minutes * (0.5 ** ((now - at) / (30 * DAY_MS))))
  }

  const sources = new Map()
  const excluded = new Set()
  for (const game of (games || []).slice(0, 100)) {
    const id = positiveId(game?.master_id)
    const title = cleanText(game?.title)
    if (!id || !title) continue
    const rank = rankByGame.get(String(id))
    const rankReaction = reaction(rank?.reaction)
    if (rankReaction === 'not_for_me') {
      excluded.add(titleKey(title))
      continue
    }
    if (rankReaction === 'mixed') continue

    const minutes = Math.max(0, finite(game?.playtime_minutes))
    const playedAt = Date.parse(game?.last_played || '')
    const recency = Number.isFinite(playedAt)
      ? clamp(0.5 ** (Math.max(0, now - playedAt) / (180 * DAY_MS)), 0.35, 1)
      : 0.6
    const lifetime = clamp(Math.log1p(minutes / 60) / 3, 0, 1.5) * recency
    const recentActivity = clamp(Math.log1p((recent.get(String(id)) || 0) / 60) / 2, 0, 1)
    const explicit = rankReaction === 'loved' ? 4 : rankReaction === 'liked' ? 2.8 : 0
    const comparisonCount = Math.max(0, finite(rank?.comparison_count))
    const score = finite(rank?.score, 1500)
    const confidence = clamp(comparisonCount / 8)
    const elo = clamp((score - 1500) / 600, -0.4, 0.4) * confidence
    const weight = (explicit + lifetime + recentActivity) * (1 + elo)
    if (weight < 0.2) continue

    const gameTraits = traits(game)
    const source = {
      masterId: id,
      title,
      reaction: rankReaction,
      weight,
      traits: gameTraits,
      laneKeys: laneKeysForTraits(gameTraits),
      score,
      comparisonCount,
      duel: duelByGame.get(id) || {
        masterId: id,
        wins: 0,
        losses: 0,
        skips: 0,
        decidedComparisons: 0,
        uniqueOpponents: 0,
        uniqueOpponentsDefeated: 0,
      },
    }
    const identity = positiveId(game?.igdb_id) ? `id:${positiveId(game.igdb_id)}` : titleKey(title)
    const previous = sources.get(identity)
    if (!previous || source.weight > previous.weight) sources.set(identity, source)
  }

  const orderedSources = [...sources.values()]
    .filter((source) => !excluded.has(titleKey(source.title)))
    .sort((left, right) => right.weight - left.weight || left.masterId - right.masterId)
  const latestMatchups = new Map()
  for (const [sourceIndex, value] of (comparisons || []).entries()) {
    const row = parsedComparison(value, sourceIndex)
    if (!row || row.result === 'skip') continue
    const key = matchupKey(row.leftId, row.rightId)
    const current = latestMatchups.get(key)
    if (!current || row.comparedAt > current.comparedAt ||
      (row.comparedAt === current.comparedAt && ((row.id && current.id && row.id > current.id) || ((!row.id || !current.id) && row.sourceIndex < current.sourceIndex)))) {
      latestMatchups.set(key, row)
    }
  }

  const lanes = TASTE_LANES.flatMap((lane) => {
    const matches = orderedSources.filter((source) => source.traits.some((value) =>
      lane.terms.some((term) => value === term || value.startsWith(`${term} `)),
    ))
    if (matches.length < 2 && !matches.some((source) => ['loved', 'liked'].includes(source.reaction))) return []
    const positive = matches.filter((source) => ['loved', 'liked'].includes(source.reaction))
    const positiveIds = new Set(positive.map((source) => source.masterId))
    const uniqueMatchups = [...latestMatchups.values()].filter((row) =>
      positiveIds.has(row.leftId) || positiveIds.has(row.rightId),
    ).length
    return [{
      key: lane.key,
      label: lane.label,
      strength: matches.slice(0, 8).reduce((sum, source, index) => sum + source.weight / (1 + index * 0.6), 0),
      positiveSourceCount: positive.length,
      supportingGameCount: matches.length,
      uniqueMatchups,
      evidenceLabel: tasteEvidenceLabel(positive.length, uniqueMatchups),
      exemplar: matches[0],
    }]
  }).sort((left, right) => right.strength - left.strength || left.key.localeCompare(right.key)).slice(0, 4)

  const reactionDistribution = { loved: 0, liked: 0, mixed: 0, not_for_me: 0 }
  for (const rank of ranks || []) {
    const value = reaction(rank?.reaction)
    if (value) reactionDistribution[value] += 1
  }
  const gameById = new Map((games || []).flatMap((game) => {
    const id = positiveId(game?.master_id)
    return id ? [[String(id), game]] : []
  }))
  const leaders = (ranks || []).flatMap((rank) => {
    const id = positiveId(rank?.master_id)
    const game = id ? gameById.get(String(id)) : null
    if (!id || !game?.title) return []
    return [{
      masterId: id,
      title: cleanText(game.title),
      score: finite(rank?.score, 1500),
      reaction: reaction(rank?.reaction),
      duel: duelByGame.get(id) || {
        wins: 0,
        losses: 0,
        decidedComparisons: 0,
        uniqueOpponentsDefeated: 0,
      },
    }]
  }).sort((left, right) => right.score - left.score || left.masterId - right.masterId).slice(0, 5)

  return {
    lanes,
    leaders,
    reactions: reactionDistribution,
    comparisons: comparisonSummary,
    coverage: {
      ...coverage,
      complete: coverage.games === true && coverage.ranks === true && coverage.activity === true && coverage.comparisons === true,
    },
  }
}

function countLabel(value, singular, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`
}

function duelText(duel, complete) {
  if (!duel?.decidedComparisons) return 'no decided duel record'
  const prefix = complete ? '' : 'available history: '
  const opponents = duel.uniqueOpponentsDefeated
    ? `, ranked above ${countLabel(duel.uniqueOpponentsDefeated, 'unique opponent')}`
    : ''
  return `${prefix}${duel.wins}-${duel.losses} raw duel record${opponents}`
}

export function formatTasteEvidence(profile) {
  const complete = profile.coverage.complete
  const duelPrefix = profile.coverage.comparisons === true ? '' : 'at least '
  const laneLines = profile.lanes.slice(0, 3).map((lane) => {
    const source = lane.exemplar
    const sourceReaction = source.reaction ? `reaction ${source.reaction}` : 'play-history signal'
    return `- ${lane.label} | ${lane.evidenceLabel} | ${countLabel(lane.positiveSourceCount, 'positively rated game')} | ${duelPrefix}${countLabel(lane.uniqueMatchups, 'unique matchup')} | example ${source.title}: ${sourceReaction}, ${duelText(source.duel, profile.coverage.comparisons === true)}`
  })
  const leaderLines = profile.leaders.map((leader) =>
    `- ${leader.title} | Elo ${Math.round(leader.score)} | ${leader.reaction ? `reaction ${leader.reaction}` : 'no reaction'} | ${duelText(leader.duel, profile.coverage.comparisons === true)}`,
  )
  const r = profile.reactions
  return [
    `PERSONAL TASTE - derived from ratings, play history, and ranking duels | coverage ${complete ? 'complete' : 'partial'}`,
    `Ranking evidence: ${duelPrefix}${countLabel(profile.comparisons.decidedComparisons, 'decided comparison')}, ${duelPrefix}${countLabel(profile.comparisons.skippedComparisons, 'skip')}, ${duelPrefix}${countLabel(profile.comparisons.uniqueMatchups, 'unique matchup')}`,
    `Ratings: ${r.loved} loved, ${r.liked} liked, ${r.mixed} mixed, ${r.not_for_me} not for me`,
    `Top taste lanes:\n${laneLines.join('\n') || '(not enough evidence yet)'}`,
    `Top Elo-ranked games:\n${leaderLines.join('\n') || '(not enough evidence yet)'}`,
  ].join('\n')
}
