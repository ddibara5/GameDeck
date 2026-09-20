// For You recommendation engine, ported from the GameDeck Expo pilot's
// Sept 10 commit (src/lib/for-you-engine.ts).
//
// Content-based relevance followed by a greedy diversity reranker (MMR).
// All work is bounded to <= 120 candidates x <= 100 evidence rows x 12 picks.
// Scores are ordering signals, never presented as match probabilities.
//
// PWA integration notes:
// - The pilot builds its TasteProfile from taste-profile.ts. Here the profile
//   comes from the PWA's own tasteEvidence.js (buildTasteEvidenceProfile);
//   adaptEngineProfile() maps it onto the shape the engine expects, so the
//   taste-derivation logic is not duplicated.
// - Candidates come from /api/discover lanes; toEngineCandidate() maps the
//   PWA's normalized game rows onto the engine's Candidate shape.

import { localDayKey } from './recommendationRotation.js'
import { titleKey } from './tasteEvidence.js'

export const FOR_YOU_VERSION = 2

export const DISCOVERY_MODES = ['familiar', 'balanced', 'adventurous']
export const DEFAULT_DISCOVERY_MODE = 'balanced'

// Local calendar day, shared with recommendationRotation's localDayKey so the
// engine, storage and rotation helpers never disagree about "today".
export function localDay(date = new Date()) {
  return localDayKey(date.getTime())
}

function countLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function formatRecommendationReason({
  source,
  lane,
  shared,
  comparisonCoverageComplete,
}) {
  if (source) {
    const bridge = shared.slice(0, 2).join(' and ')
    const defeated = source.duel.uniqueOpponentsDefeated
    if (defeated > 0) {
      const duelProof = comparisonCoverageComplete
        ? `ranked above ${countLabel(defeated, 'opponent')}`
        : `recorded above at least ${countLabel(defeated, 'opponent')} in the available duel history`
      return `Shares ${bridge} traits with ${source.title}, which you ${source.reaction} and ${duelProof}.`
    }
    return `Shares ${bridge} traits with ${source.title}, which you ${source.reaction}.`
  }

  if (lane) {
    if (lane.positiveSourceCount > 0) {
      const ratings = countLabel(lane.positiveSourceCount, 'positively rated game')
      const matchups = lane.uniqueMatchups
        ? comparisonCoverageComplete
          ? ` and ${countLabel(lane.uniqueMatchups, 'unique matchup')}`
          : ` and at least ${countLabel(lane.uniqueMatchups, 'unique matchup')} in the available duel history`
        : ''
      return `Matches your ${lane.label.toLowerCase()} tastes, based on ${ratings}${matchups}.`
    }
    return `Matches your ${lane.label.toLowerCase()} tastes, supported by play history from ${countLabel(lane.supportingGameCount, 'game')}.`
  }

  return shared.length
    ? `Explore more ${shared[0]} games.`
    : 'A fresh discovery on your selected platforms.'
}

// Short trigger label for the tappable reason pill (ported from the pilot's
// ForYouRow): evidence coverage, then the source game or lane, then traits.
export function recommendationTrigger(pick, laneLabel) {
  const evidence = pick.evidence || {}
  const evidenceTrigger = evidence.source?.title ?? laneLabel
  const trigger = evidence.laneEvidence?.evidenceLabel
    ? `${evidence.laneEvidence.evidenceLabel}${evidenceTrigger ? ` \u00b7 ${evidenceTrigger}` : ''}`
    : (evidenceTrigger
      ?? (evidence.shared?.length && !evidence.lane
        ? `Explore ${evidence.shared[0]}`
        : 'New discovery'))
  return trigger.charAt(0).toUpperCase() + trigger.slice(1)
}

// Canonical display labels for known lane keys. The canonical source for the
// taste lanes is TASTE_LANES in tasteEvidence.js; the API PRESETS in
// api/discover.js add arpg / fromsoft / rockstar for catalog lanes. Keys are
// kept here (not imported) so this module stays import-light for tests.
const LANE_DISPLAY_LABELS = {
  soulslike: 'Soulslike',
  openworld: 'Open world',
  survival: 'Survival',
  story: 'Story rich',
  postapoc: 'Post-apocalyptic',
  horror: 'Horror',
  jrpg: 'JRPG',
  stealth: 'Stealth',
  metroidvania: 'Metroidvania',
  arpg: 'ARPG',
  fromsoft: 'FromSoftware',
  rockstar: 'Rockstar',
}

// Format any lane key as a human-readable display label: canonical labels for
// known keys; otherwise split camelCase and dash/underscore separators, then
// title-case each word. Every rendered lane name keeps real spaces so label
// text can never concatenate (e.g. in accessibility trees or string builds).
export function formatLaneLabel(key) {
  const raw = String(key || '').trim()
  if (!raw || raw === 'new') return null
  const known = LANE_DISPLAY_LABELS[raw.toLowerCase()]
  if (known) return known
  const words = raw
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return null
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

// Resolve the human label for a recommendation's lane. The engine picks carry
// the full lane evidence (including its label); the laneKeys param is kept
// for API parity with the pilot's for-you.ts.
export function forYouLaneLabel(pick, laneKeys = []) {
  const lane = pick?.evidence?.laneEvidence
  if (lane?.label) return lane.label
  return formatLaneLabel(pick?.evidence?.lane ?? pick?.laneKey)
}

// Derive the "Why this pick" reason rows for a deck pick. The engine emits a
// singular `reason` string; a richer `reasons` array is only present when a
// breakdown was built. Always returns an array so the sheet can never throw
// on production-shaped picks.
export function whyPickReasons(pick) {
  if (Array.isArray(pick?.reasons) && pick.reasons.length) return pick.reasons
  if (pick?.reason) return [{ label: pick.kind || 'Why this pick', detail: pick.reason }]
  return []
}

// A soft diversity hint, never an ownership/exclusion identity.
export function familyKey(title, parent = null) {
  const id = typeof parent === 'number' && Number.isSafeInteger(parent) && parent > 0 ? parent : null
  if (id) return `parent:${id}`
  const base = String(title || '').split(':')[0]
  return titleKey(base).replace(/\s+(?:\d+|ii|iii|iv|v|vi|vii|viii|ix|x)\b.*$/, '')
}

export function stableHash(value) {
  let hash = 2166136261
  const text = String(value)
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  }
  return (hash >>> 0) / 4294967296
}

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value))

function normalized(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// titleKey is imported from tasteEvidence.js so candidate titles are
// normalized exactly like the profile's excludedTitles.

export function candidateTraits(game) {
  return [
    ...new Set(
      [...(game.genres || []), ...(game.themes || []), ...(game.keywords || [])]
        .map(normalized)
        .filter(Boolean),
    ),
  ]
}

// Map the PWA's /api/discover normalized game row onto the engine Candidate.
export function toEngineCandidate(game, laneKey) {
  const id = Number(game?.id ?? game?.igdb_id) || 0
  const name = String(game?.name || game?.title || '').trim()
  return {
    ...game,
    id,
    title: name,
    genres: Array.isArray(game?.genres) ? game.genres : [],
    themes: Array.isArray(game?.themes) ? game.themes : [],
    keywords: Array.isArray(game?.keywords) ? game.keywords : [],
    platforms: Array.isArray(game?.platforms) ? game.platforms : [],
    ratingCount: Math.max(0, Number(game?.ratingCount) || 0),
    released: Number(game?.released) > 0 ? Number(game.released) : null,
    year: typeof game?.year === 'number' ? game.year : null,
    family: familyKey(name),
    lanes: laneKey ? [laneKey] : [],
  }
}

// Map buildTasteEvidenceProfile() output onto the engine's profile shape.
// Lanes carry everything the engine needs already; sources and excludedTitles
// are exposed by tasteEvidence.js (added for this integration).
export function adaptEngineProfile(evidenceProfile) {
  const profile = evidenceProfile || {}
  return {
    lanes: Array.isArray(profile.lanes) ? profile.lanes : [],
    sources: Array.isArray(profile.sources)
      ? profile.sources.map((source) => ({
        id: String(source.masterId ?? source.id ?? ''),
        title: source.title,
        reaction: source.reaction || null,
        weight: Number(source.weight) || 0,
        traits: Array.isArray(source.traits) ? source.traits : [],
        laneKeys: Array.isArray(source.laneKeys) ? source.laneKeys : [],
        duel: {
          uniqueOpponentsDefeated:
            Number(source.duel?.uniqueOpponentsDefeated) || 0,
        },
      }))
      : [],
    excludedTitles: Array.isArray(profile.excludedTitles) ? profile.excludedTitles : [],
    coverage: {
      comparisons: {
        complete: profile.coverage?.comparisons === true,
      },
    },
  }
}

// Content-based relevance followed by a greedy diversity reranker (MMR).
// All work is bounded to <= 120 candidates x <= 100 evidence rows x 12 picks.
// Scores are ordering signals, never presented as match probabilities.
export function selectRecommendations(candidates, profile, options) {
  const now = options.now ?? Date.now()
  const limit = Math.min(12, Math.max(0, options.limit ?? 12))
  const exposures = new Map((options.exposures ?? []).map((e) => [e.id, e]))
  const less = new Set((options.less ?? []).map((p) => p.key))
  const more = new Set((options.more ?? []).map((p) => p.key))
  const excludedTitles = new Set(profile.excludedTitles || [])
  const sourceTraits = (profile.sources || []).map((source) => ({
    source,
    set: new Set(source.traits),
  }))
  const frequencies = new Map()
  for (const { set } of sourceTraits) {
    for (const trait of set) {
      frequencies.set(trait, (frequencies.get(trait) ?? 0) + 1)
    }
  }
  const specificity = new Map(
    [...frequencies].map(([trait, count]) => [
      trait,
      1 + Math.log((profile.sources.length + 1) / (count + 1)),
    ]),
  )
  const maxStrength = Math.max(1, ...(profile.lanes || []).map((l) => l.strength))
  const pool = []
  const seen = new Set()
  for (const game of (candidates || []).slice(0, 120)) {
    if (
      !game ||
      seen.has(game.id) ||
      options.exclude?.has(game.id) ||
      excludedTitles.has(titleKey(game.title))
    ) {
      continue
    }
    seen.add(game.id)
    const gameTraits = candidateTraits(game)
    let best = 0
    let source = null
    let shared = []
    for (const entry of sourceTraits) {
      const overlap = gameTraits.filter((t) => entry.set.has(t))
      // Rare shared traits are more specific than ubiquitous tags like "action".
      const sum = overlap.reduce((n, t) => n + (specificity.get(t) ?? 1), 0)
      const affinity =
        (sum / Math.max(3, Math.sqrt(gameTraits.length * entry.set.size))) *
        clamp(entry.source.weight / 4, 0, 1.5)
      if (affinity > best) {
        best = affinity
        source = entry.source
        shared = overlap
      }
    }
    const matchingLanes = (profile.lanes || []).filter((l) =>
      (game.lanes || []).includes(l.key),
    )
    const laneAffinity = Math.max(
      0,
      ...matchingLanes.map((l) => Math.sqrt(l.strength / maxStrength)),
    )
    const relevance = clamp(best * 0.65 + laneAffinity * 0.35)
    const votes = Math.max(0, game.ratingCount || 0)
    const quality =
      (((game.rating ?? 72) * votes + 72 * 25) / (votes + 25)) / 100
    const released = game.released ? game.released * 1000 : 0
    const freshness = released
      ? Math.exp(-Math.abs(now - released) / (540 * 86400000))
      : 0
    const exposure = exposures.get(game.id)
    const fatigue = exposure
      ? clamp(exposure.count / 4) *
        Math.exp(-Math.max(0, now - exposure.at) / (10 * 86400000)) *
        0.28
      : 0
    const preferencePenalty =
      matchingLanes.some((l) => less.has(l.key)) ||
      gameTraits.some((t) => less.has(`trait:${t}`))
        ? 0.45
        : 0
    // A bounded positive signal: multiple matching preferences do not stack.
    // Negative feedback wins for a game that matches both; diversity still applies.
    const preferenceBoost =
      !preferencePenalty &&
      (matchingLanes.some((l) => more.has(l.key)) ||
        gameTraits.some((t) => more.has(`trait:${t}`)))
        ? 0.25
        : 0
    const affinityWeight =
      options.mode === 'familiar'
        ? 0.76
        : options.mode === 'adventurous'
          ? 0.48
          : 0.64
    const value =
      relevance * affinityWeight +
      quality * 0.18 +
      freshness * 0.1 -
      fatigue -
      preferencePenalty +
      preferenceBoost +
      stableHash(`${options.seed}:${game.id}`) * 0.055
    pool.push({
      game,
      relevance,
      value,
      shared,
      source,
      matchingLanes,
      traits: gameTraits,
    })
  }
  const selected = []
  const laneCounts = new Map()
  const sourceCounts = new Map()
  const explorationTarget =
    options.mode === 'familiar' ? 1 : options.mode === 'adventurous' ? 4 : 2
  let discoveries = 0
  const desiredLane = (item) =>
    [...item.matchingLanes].sort(
      (a, b) =>
        (laneCounts.get(a.key) ?? 0) - (laneCounts.get(b.key) ?? 0) ||
        b.strength - a.strength,
    )[0] ?? null
  const take = (item) => {
    const lane = desiredLane(item)
    selected.push({ item, lane })
    if (lane) laneCounts.set(lane.key, (laneCounts.get(lane.key) ?? 0) + 1)
    if (item.source) {
      sourceCounts.set(item.source.id, (sourceCounts.get(item.source.id) ?? 0) + 1)
    }
    if ((item.game.lanes || []).includes('new') || !lane) discoveries++
    pool.splice(pool.indexOf(item), 1)
  }
  // Reconcile a same-day slate by stable game ID, not by numeric position.
  for (const id of options.preferred ?? []) {
    const item = pool.find((p) => p.game.id === id)
    if (item && selected.length < limit) take(item)
  }
  while (selected.length < limit && pool.length) {
    const needDiscovery =
      discoveries < explorationTarget &&
      (selected.length % Math.max(2, Math.floor(12 / explorationTarget)) ===
        Math.max(2, Math.floor(12 / explorationTarget)) - 1 ||
        limit - selected.length <= explorationTarget - discoveries)
    let eligible = pool
    if (needDiscovery) {
      const discoveryPool = pool.filter(
        (p) => (p.game.lanes || []).includes('new') || !p.matchingLanes.length,
      )
      if (discoveryPool.length) eligible = discoveryPool
    }
    // Relax the category cap only when every remaining option exceeds it.
    const varied = eligible.filter(
      (p) =>
        !p.matchingLanes.length ||
        p.matchingLanes.some((l) => (laneCounts.get(l.key) ?? 0) < 4),
    )
    if (varied.length) eligible = varied
    let winner = eligible[0]
    let bestValue = -Infinity
    for (const item of eligible) {
      const lane = desiredLane(item)
      const familyCount = selected.filter(
        (s) => s.item.game.family === item.game.family,
      ).length
      const similarity = Math.max(
        0,
        ...selected.map((s) => {
          const sharedCount = item.traits.filter((t) =>
            s.item.traits.includes(t),
          ).length
          return (
            sharedCount /
            Math.max(1, new Set([...item.traits, ...s.item.traits]).size)
          )
        }),
      )
      const diversity =
        options.mode === 'adventurous'
          ? 0.25
          : options.mode === 'familiar'
            ? 0.1
            : 0.18
      const adjusted =
        item.value -
        familyCount * 0.4 -
        similarity * diversity -
        (lane ? (laneCounts.get(lane.key) ?? 0) * 0.085 : 0) -
        (item.source ? (sourceCounts.get(item.source.id) ?? 0) * 0.045 : 0)
      if (
        adjusted > bestValue ||
        (adjusted === bestValue && item.game.id < winner.game.id)
      ) {
        winner = item
        bestValue = adjusted
      }
    }
    take(winner)
  }
  return selected.map(({ item, lane }) => {
    // At least two shared metadata traits are required for a title-specific claim.
    const source =
      item.shared.length >= 2 &&
      (item.source?.reaction === 'loved' || item.source?.reaction === 'liked')
        ? item.source
        : null
    const shared = item.shared.slice(0, 5)
    const comparisonCoverageComplete = profile.coverage.comparisons.complete
    const reason = formatRecommendationReason({
      source,
      lane,
      shared,
      comparisonCoverageComplete,
    })
    return {
      game: item.game,
      kind: lane
        ? 'For your tastes'
        : item.relevance >= 0.2
          ? 'Worth exploring'
          : 'New discovery',
      reason,
      evidence: {
        source,
        shared,
        lane: lane?.key ?? null,
        laneEvidence: lane
          ? {
            key: lane.key,
            label: lane.label,
            evidenceLabel: lane.evidenceLabel,
            positiveSourceCount: lane.positiveSourceCount,
            supportingGameCount: lane.supportingGameCount,
            uniqueMatchups: lane.uniqueMatchups,
          }
          : null,
        comparisonCoverageComplete,
        kind: source ? 'source' : lane ? 'lane' : shared.length ? 'trait' : 'discovery',
      },
      score: Math.round(item.value * 1000) / 1000,
    }
  })
}
