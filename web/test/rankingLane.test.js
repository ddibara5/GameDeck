import test from 'node:test'
import assert from 'node:assert/strict'

import {
  RANK_PAIR_SKIP_CUTOFF_MS,
  chooseAnchoredRankingPair,
  eligibleOwnedLaneRankings,
} from '../src/lib/rankingPairs.js'

const NOW = Date.now()
const DAY = 86400000

function decided(a, b, result, daysAgo) {
  return {
    left_id: a,
    right_id: b,
    result,
    compared_at: new Date(NOW - daysAgo * DAY).toISOString(),
  }
}

function skipped(a, b, hoursAgo) {
  return {
    left_id: a,
    right_id: b,
    result: 'skip',
    compared_at: new Date(NOW - hoursAgo * 3600000).toISOString(),
  }
}

const rank = (master_id, score, comparison_count = 0) => ({ master_id, score, comparison_count })

test('the anchor leads on the left', () => {
  const ranks = [rank(1, 1700), rank(2, 1500), rank(3, 1400)]
  const pair = chooseAnchoredRankingPair(ranks, [], NOW, 3)
  assert.equal(pair.left.master_id, 3)
  assert.equal(pair.right.master_id, 2)
})

test('the closest-Elo opponent is chosen', () => {
  const ranks = [rank(1, 1800), rank(2, 1520), rank(3, 1500), rank(4, 1100)]
  const pair = chooseAnchoredRankingPair(ranks, [], NOW, 1)
  assert.equal(pair.left.master_id, 1)
  assert.equal(pair.right.master_id, 2)
})

test('an unseen matchup is preferred over a seen closer one', () => {
  const ranks = [rank(1, 1500), rank(2, 1510), rank(3, 1600)]
  const comparisons = [decided(1, 2, 'left', 5)]
  const pair = chooseAnchoredRankingPair(ranks, comparisons, NOW, 1)
  assert.equal(pair.right.master_id, 3)
})

test('recently skipped pairs are excluded from opponents', () => {
  const ranks = [rank(1, 1500), rank(2, 1510), rank(3, 1600)]
  const comparisons = [skipped(1, 2, 1), skipped(1, 3, 2)]
  const cutoff = NOW - RANK_PAIR_SKIP_CUTOFF_MS
  assert.equal(chooseAnchoredRankingPair(ranks, comparisons, cutoff, 1), null)
})

test('stale skips are allowed back in rotation', () => {
  const ranks = [rank(1, 1500), rank(2, 1510)]
  const oldSkip = { left_id: 1, right_id: 2, result: 'skip', compared_at: new Date(NOW - 100 * DAY).toISOString() }
  const pair = chooseAnchoredRankingPair(ranks, [oldSkip], NOW - RANK_PAIR_SKIP_CUTOFF_MS, 1)
  assert.equal(pair.right.master_id, 2)
})

test('when every matchup is seen, the oldest decided matchup comes first', () => {
  const ranks = [rank(1, 1500), rank(2, 1510), rank(3, 1520)]
  const comparisons = [decided(1, 2, 'left', 30), decided(1, 3, 'right', 5)]
  const pair = chooseAnchoredRankingPair(ranks, comparisons, NOW, 1)
  assert.equal(pair.right.master_id, 2)
})

test('ties fall through to fewest comparisons then lowest master id', () => {
  const ranks = [
    rank(1, 1500),
    rank(5, 1510, 4),
    rank(4, 1510, 4),
    rank(3, 1510, 1),
  ]
  const pair = chooseAnchoredRankingPair(ranks, [], NOW, 1)
  assert.equal(pair.right.master_id, 3)
})

test('a missing anchor returns null', () => {
  const ranks = [rank(1, 1500), rank(2, 1510)]
  assert.equal(chooseAnchoredRankingPair(ranks, [], NOW, 99), null)
})

test('a lone anchor with no eligible opponent returns null', () => {
  const ranks = [rank(1, 1500)]
  assert.equal(chooseAnchoredRankingPair(ranks, [], NOW, 1), null)
  assert.equal(chooseAnchoredRankingPair([], [], NOW, 1), null)
})

test('skips do not count as decided matchups', () => {
  const ranks = [rank(1, 1500), rank(2, 1510), rank(3, 1600)]
  const comparisons = [
    decided(1, 2, 'left', 5),
    skipped(1, 3, 1),
  ]
  const pair = chooseAnchoredRankingPair(ranks, comparisons, NOW, 1)
  assert.equal(pair.right.master_id, 3)
})

test('eligibleOwnedLaneRankings keeps owned lane members only', () => {
  const rankedItems = [
    { rank: rank(1, 1700), game: { master_id: 1, title: 'Owned lane' } },
    { rank: rank(2, 1600), game: { master_id: 2, title: 'Owned not lane' } },
    { rank: rank(3, 1500), game: { master_id: 3, title: 'Lane not owned' } },
    { rank: rank(4, 1400), game: { master_id: 4, title: 'Neither' } },
  ]
  const lane = new Set([1, 3])
  const owned = new Set([1, 2])
  const kept = eligibleOwnedLaneRankings(rankedItems, lane, owned)
  assert.deepEqual(kept.map((item) => item.game.master_id), [1])
})

test('eligibleOwnedLaneRankings accepts arrays and falls back to rank ids', () => {
  const rankedItems = [
    { rank: rank(7, 1700) },
    { rank: { master_id: '8', score: 1500 }, game: {} },
    { rank: rank(0, 1400), game: { master_id: 0 } },
  ]
  const kept = eligibleOwnedLaneRankings(rankedItems, [7, 8, 0], [7, '8', 0])
  assert.deepEqual(kept.map((item) => Number(item.rank.master_id)), [7, 8])
})

test('eligibleOwnedLaneRankings tolerates bad input', () => {
  assert.deepEqual(eligibleOwnedLaneRankings(null, new Set(), new Set()), [])
  assert.deepEqual(eligibleOwnedLaneRankings([{ rank: null }], new Set([1]), new Set([1])), [])
})
