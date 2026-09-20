import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDuelReceipt,
  bustTasteProfile,
  loadTasteProfile,
} from '../src/lib/tasteProfile.js'
import { buildTasteEvidenceProfile } from '../src/lib/tasteEvidence.js'

const NOW = Date.parse('2026-09-19T12:00:00Z')

function fixtureInputs() {
  const games = [
    { master_id: 1, igdb_id: 101, title: 'Elden Ring', keywords: ['soulslike', 'open world'], playtime_minutes: 4800, last_played: '2026-09-18' },
    { master_id: 2, igdb_id: 102, title: 'Dark Souls III', keywords: ['soulslike'], playtime_minutes: 3600, last_played: '2026-08-01' },
    { master_id: 3, igdb_id: 103, title: 'Hollow Knight', keywords: ['metroidvania'], playtime_minutes: 1200, last_played: '2026-09-10' },
    { master_id: 4, igdb_id: 104, title: 'Silksong', keywords: ['metroidvania'], playtime_minutes: 300, last_played: '2026-09-17' },
  ]
  const ranks = [
    { master_id: 1, reaction: 'loved', score: 1680, comparison_count: 8 },
    { master_id: 2, reaction: 'liked', score: 1600, comparison_count: 8 },
    { master_id: 3, reaction: 'loved', score: 1620, comparison_count: 6 },
    { master_id: 4, reaction: 'liked', score: 1520, comparison_count: 4 },
  ]
  const comparisons = [
    { id: 1, left_id: 1, right_id: 2, result: 'left', compared_at: '2026-09-18T12:00:00Z' },
    { id: 2, left_id: 3, right_id: 4, result: 'left', compared_at: '2026-09-17T12:00:00Z' },
  ]
  return {
    games,
    ranks,
    activity: [],
    comparisons,
    coverage: { games: true, ranks: true, activity: true, comparisons: true },
  }
}

test('loadTasteProfile builds the shared evidence profile through injected inputs', async () => {
  let calls = 0
  const profile = await loadTasteProfile({
    now: NOW,
    fetchInputs: async () => {
      calls += 1
      return fixtureInputs()
    },
  })
  assert.equal(calls, 1)
  // The visible surface shows every lane with evidence, not just the top four
  // the For You catalog fetch uses.
  assert.ok(profile.lanes.length >= 2)
  assert.ok(profile.lanes.some((lane) => lane.key === 'soulslike'))
  assert.ok(profile.lanes.some((lane) => lane.key === 'metroidvania'))
  assert.equal(profile.sources.length, 4)
  assert.equal(profile.leaders[0].title, 'Elden Ring')
})

test('loadTasteProfile force reloads even when the fetcher would otherwise be skipped', async () => {
  let calls = 0
  const fetchInputs = async () => {
    calls += 1
    return fixtureInputs()
  }
  await loadTasteProfile({ now: NOW, fetchInputs })
  await loadTasteProfile({ now: NOW, fetchInputs, force: true })
  assert.equal(calls, 2)
})

test('loadTasteProfile surfaces fetch failures instead of swallowing them', async () => {
  await assert.rejects(
    () => loadTasteProfile({ now: NOW, fetchInputs: async () => { throw new Error('bootstrap down') } }),
    /bootstrap down/,
  )
})

test('buildTasteEvidenceProfile maxLanes defaults to four for the For You engine', () => {
  const four = buildTasteEvidenceProfile({ ...fixtureInputs(), now: NOW })
  const nine = buildTasteEvidenceProfile({ ...fixtureInputs(), now: NOW, maxLanes: 9 })
  assert.ok(four.lanes.length <= 4)
  assert.ok(nine.lanes.length >= four.lanes.length)
})

test('bustTasteProfile never throws, even without IndexedDB', async () => {
  await bustTasteProfile()
})

test('buildDuelReceipt returns null for a skipped duel', () => {
  assert.equal(
    buildDuelReceipt({
      winnerId: 1,
      loserId: 2,
      winnerTitle: 'Elden Ring',
      loserTitle: 'Dark Souls III',
      result: 'skip',
      ranks: [],
      profile: null,
    }),
    null,
  )
})

test('buildDuelReceipt keeps reactions and duel outcomes as separate facts', () => {
  const profile = buildTasteEvidenceProfile({ ...fixtureInputs(), now: NOW, maxLanes: 9 })
  const receipt = buildDuelReceipt({
    winnerId: 1,
    loserId: 2,
    winnerTitle: 'Elden Ring',
    loserTitle: 'Dark Souls III',
    result: 'left',
    ranks: fixtureInputs().ranks,
    profile,
  })
  assert.equal(receipt.headline, 'You ranked Elden Ring above Dark Souls III.')
  // Elo and the raw duel record appear; the reaction is not restated as a
  // duel outcome and duels are not restated as a reaction.
  assert.match(receipt.detail, /Elo 1680/)
  assert.match(receipt.detail, /1-0 in duels/)
  assert.ok(receipt.laneLabels.includes('Soulslike'))
  assert.ok(receipt.laneLabels.includes('Open world'))
})

test('buildDuelReceipt degrades gracefully without a profile source', () => {
  const receipt = buildDuelReceipt({
    winnerId: 9,
    loserId: 2,
    winnerTitle: 'Unknown Game',
    loserTitle: 'Dark Souls III',
    result: 'left',
    ranks: [{ master_id: 9, score: 1512, comparison_count: 1 }],
    profile: null,
  })
  assert.equal(receipt.headline, 'You ranked Unknown Game above Dark Souls III.')
  assert.match(receipt.detail, /Elo 1512/)
  assert.match(receipt.detail, /first recorded duel/)
  assert.deepEqual(receipt.laneLabels, [])
})
