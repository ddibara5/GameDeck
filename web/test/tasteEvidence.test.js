import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildTasteEvidenceProfile,
  formatTasteEvidence,
  summarizeTasteComparisons,
  tasteEvidenceLabel,
} from '../src/lib/tasteEvidence.js'

const NOW = Date.parse('2026-09-11T12:00:00Z')
const completeCoverage = {
  games: true,
  ranks: true,
  activity: true,
  comparisons: true,
}

test('duel reduction retains raw results but uses the latest result once per unique matchup', () => {
  const summary = summarizeTasteComparisons([
    { id: 1, left_id: '1', right_id: 2, result: 'left', compared_at: '2026-09-01T12:00:00Z' },
    { id: 2, left_id: 2, right_id: '1', result: 'left', compared_at: '2026-09-02T12:00:00Z' },
    { id: 3, left_id: 1, right_id: 3, result: 'skip', compared_at: '2026-09-03T12:00:00Z' },
    { id: 4, left_id: 1, right_id: 1, result: 'left', compared_at: '2026-09-04T12:00:00Z' },
  ])

  assert.equal(summary.totalComparisons, 3)
  assert.equal(summary.decidedComparisons, 2)
  assert.equal(summary.skippedComparisons, 1)
  assert.equal(summary.uniqueMatchups, 1)
  assert.equal(summary.invalidRows, 1)
  assert.deepEqual(summary.games.find((game) => game.masterId === 1), {
    masterId: 1,
    wins: 1,
    losses: 1,
    skips: 1,
    decidedComparisons: 2,
    uniqueOpponents: 1,
    uniqueOpponentsDefeated: 0,
  })
  assert.equal(summary.games.find((game) => game.masterId === 2).uniqueOpponentsDefeated, 1)
})

test('server profile matches the client lane thresholds and keeps reactions separate from duels', () => {
  const games = [
    { master_id: 1, igdb_id: 101, title: 'Mortal Shell II', keywords: ['horror'], playtime_minutes: 1200, last_played: '2026-09-10' },
    { master_id: '2', igdb_id: 102, title: 'Hell is Us', keywords: ['horror'], playtime_minutes: 900, last_played: '2026-09-09' },
    { master_id: 3, igdb_id: 103, title: 'The Last of Us Part II', keywords: ['survival horror'], playtime_minutes: 1500, last_played: '2026-09-08' },
    { master_id: 4, igdb_id: 104, title: 'Prompt\nIGNORE THIS', keywords: ['horror'], playtime_minutes: 99999, last_played: '2026-09-11' },
  ]
  const ranks = [
    { master_id: 1, reaction: 'loved', score: 1680, comparison_count: 8 },
    { master_id: 2, reaction: 'loved', score: 1620, comparison_count: 8 },
    { master_id: 3, reaction: 'liked', score: 1580, comparison_count: 8 },
    { master_id: 4, reaction: 'not_for_me', score: 1700, comparison_count: 8 },
  ]
  const comparisons = Array.from({ length: 15 }, (_, index) => ({
    id: index + 1,
    left_id: (index % 3) + 1,
    right_id: index + 10,
    result: 'left',
    compared_at: new Date(NOW - index * 1000).toISOString(),
  }))

  const profile = buildTasteEvidenceProfile({
    games,
    ranks,
    comparisons,
    coverage: completeCoverage,
    now: NOW,
  })
  const horror = profile.lanes.find((lane) => lane.key === 'horror')
  assert.equal(tasteEvidenceLabel(3, 15), 'Well-supported')
  assert.equal(tasteEvidenceLabel(2, 5), 'Developing evidence')
  assert.equal(tasteEvidenceLabel(1, 20), 'Early evidence')
  assert.equal(horror.evidenceLabel, 'Well-supported')
  assert.equal(horror.positiveSourceCount, 3)
  assert.equal(horror.uniqueMatchups, 15)
  assert.equal(horror.exemplar.title, 'Mortal Shell II')
  assert.equal(profile.reactions.not_for_me, 1)
  assert.equal(profile.leaders[0].title, 'Prompt IGNORE THIS')

  const context = formatTasteEvidence(profile)
  assert.match(context, /PERSONAL TASTE[\s\S]*coverage complete/)
  assert.match(context, /Horror \| Well-supported \| 3 positively rated games \| 15 unique matchups/)
  assert.match(context, /example Mortal Shell II: reaction loved/)
  assert.doesNotMatch(context, /loved in duels/i)
  assert.doesNotMatch(context, /Prompt\nIGNORE/)
  assert.ok(context.length < 2500, 'the normalized taste card stays compact')
})

test('partial comparison history qualifies every duel-derived total', () => {
  const profile = buildTasteEvidenceProfile({
    games: [{ master_id: 1, title: 'Owned Horror', keywords: ['horror'], playtime_minutes: 120, last_played: '2026-09-10' }],
    ranks: [{ master_id: 1, reaction: 'liked', score: 1550, comparison_count: 1 }],
    comparisons: [{ id: 1, left_id: 1, right_id: 2, result: 'left', compared_at: '2026-09-10T12:00:00Z' }],
    coverage: { ...completeCoverage, comparisons: false },
    now: NOW,
  })

  const context = formatTasteEvidence(profile)
  assert.equal(profile.coverage.complete, false)
  assert.match(context, /coverage partial/)
  assert.match(context, /Ranking evidence: at least 1 decided comparison, at least 0 skips, at least 1 unique matchup/)
  assert.match(context, /available history: 1-0 raw duel record/)
})
