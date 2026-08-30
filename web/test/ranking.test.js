import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  closestRankNeighbor,
  chooseComparisonPair,
  eloChange,
  estimateRankPlacement,
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

test('a direct reaction previews insertion position, tier, and closest neighbor', () => {
  const ranks = [
    { master_id: 1, score: 1700, comparison_count: 5 },
    { master_id: 2, score: 1560, comparison_count: 2 },
    { master_id: 3, score: 1400, comparison_count: 0 },
  ]
  assert.deepEqual(estimateRankPlacement(ranks, 1650), { position: 2, tier: 'B' })
  assert.equal(closestRankNeighbor(ranks, 1650).master_id, 1)
})

test('Rankings offers direct library search and makes comparison optional', () => {
  const rankings = readFileSync(new URL('../src/components/RankingsTab.jsx', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('../src/components/rankings.css', import.meta.url), 'utf8')
  const sheet = readFileSync(new URL('../src/components/RankGameSheet.jsx', import.meta.url), 'utf8')
  assert.match(rankings, /Search your library to rank/)
  assert.doesNotMatch(rankings, /rank-primary-action/)
  assert.match(rankings, /onClick=\{\(\) => onSelect\(game\)\}/)
  assert.match(rankings, /<GameDetail game=\{selectedGame\}/)
  assert.match(rankings, /rank-tier tier-/)
  assert.match(rankings, /ranked \$\{position\}, \$\{tier\} tier/)
  assert.match(styles, /\.rank-place\.tier-c/)
  assert.doesNotMatch(rankings, /unseeded\[0\]/)
  assert.match(sheet, /Save to rankings/)
  assert.match(sheet, /Maybe later/)
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
