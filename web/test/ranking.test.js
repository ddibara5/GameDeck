import test from 'node:test'
import assert from 'node:assert/strict'
import {
  chooseComparisonPair,
  eloChange,
  isRankingEligible,
  seedForReaction,
  tierForPosition,
} from '../src/lib/rankingMath.js'

test('reaction seeds preserve the intended order', () => {
  assert.deepEqual(['loved', 'liked', 'mixed', 'not_for_me'].map(seedForReaction), [1650, 1550, 1450, 1350])
})

test('Elo uses K 32 for calibration and K 16 after six comparisons', () => {
  assert.equal(eloChange(1500, 1500, 0, 8, 1).k, 32)
  assert.equal(eloChange(1500, 1500, 6, 6, 1).delta, 8)
  assert.equal(eloChange(1500, 1500, 6, 6, 0).delta, -8)
})

test('tiers are percentile based', () => {
  assert.equal(tierForPosition(0, 10), 'S')
  assert.equal(tierForPosition(1, 10), 'A')
  assert.equal(tierForPosition(4, 10), 'B')
  assert.equal(tierForPosition(8, 10), 'C')
})

test('eligibility accepts explicit finishes or enough real play', () => {
  assert.equal(isRankingEligible({ playtime_minutes: 0 }, 'finished'), true)
  assert.equal(isRankingEligible({ playtime_minutes: 119, length_minutes: 1000 }, null), false)
  assert.equal(isRankingEligible({ playtime_minutes: 120 }, null), true)
  assert.equal(isRankingEligible({ playtime_minutes: 60, length_minutes: 300 }, null), true)
})

test('pair choice favors uncertainty, close scores, and suppresses skips for 90 days', () => {
  const now = Date.parse('2026-08-24T12:00:00Z')
  const ranks = [
    { master_id: 1, score: 1500, comparison_count: 0 },
    { master_id: 2, score: 1505, comparison_count: 2 },
    { master_id: 3, score: 1600, comparison_count: 0 },
  ]
  assert.deepEqual(chooseComparisonPair(ranks, [], now).map((x) => x.master_id), [3, 2])
  const skipped = [{ left_id: 3, right_id: 2, result: 'skip', compared_at: '2026-08-20T00:00:00Z' }]
  assert.deepEqual(chooseComparisonPair(ranks, skipped, now).map((x) => x.master_id), [3, 1])
})
