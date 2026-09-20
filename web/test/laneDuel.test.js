import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LANE_DUEL_RECEIPT_TTL_MS,
  consumeLaneDuelReceipt,
  parseTuneLaunch,
  publishLaneDuelReceipt,
  resolveTuneLaunch,
  shouldReturnFromLaneDuel,
} from '../src/lib/laneDuel.js'

// The taste lane contract lives on TASTE_LANES (soulslike, openworld, ...).
// For parseTuneLaunch we inject a small lane set so the tests do not depend
// on the full catalog list.
const LANES = new Set(['soulslike', 'openworld'])

function fakeProfile(lanes) {
  return { lanes }
}

test('parseTuneLaunch preserves a valid launch', () => {
  const parsed = parseTuneLaunch(
    {
      laneKey: 'soulslike',
      laneLabel: 'Soulslike',
      anchorId: 10,
      recommendationId: 42,
      laneMemberIds: [10, 42, 77],
      returnToForYou: true,
    },
    LANES,
  )
  assert.equal(parsed.laneKey, 'soulslike')
  assert.equal(parsed.laneLabel, 'Soulslike')
  assert.equal(parsed.anchorId, 10)
  assert.equal(parsed.recommendationId, 42)
  assert.deepEqual(parsed.laneMemberIds, [10, 42, 77])
  assert.equal(parsed.returnToForYou, true)
})

test('parseTuneLaunch nulls ids and returnToForYou for an unknown lane', () => {
  const parsed = parseTuneLaunch(
    {
      laneKey: 'roguelike',
      laneLabel: 'Roguelike',
      anchorId: 10,
      recommendationId: 42,
      laneMemberIds: [10, 42],
      returnToForYou: true,
    },
    LANES,
  )
  assert.equal(parsed.laneKey, null)
  assert.equal(parsed.anchorId, null)
  assert.equal(parsed.recommendationId, null)
  assert.equal(parsed.returnToForYou, false)
})

test('parseTuneLaunch parses numeric-string ids and filters lane members', () => {
  const parsed = parseTuneLaunch(
    {
      laneKey: 'openworld',
      anchorId: '10',
      recommendationId: '42',
      laneMemberIds: ['10', 10, 42, 0, -3, 'nope', null, 77],
      returnToForYou: true,
    },
    LANES,
  )
  assert.equal(parsed.anchorId, 10)
  assert.equal(parsed.recommendationId, 42)
  // deduped ('10' collapses into 10) and non-positive/non-numeric dropped
  assert.deepEqual(parsed.laneMemberIds, [10, 42, 77])
})

test('shouldReturnFromLaneDuel is true for a decided duel on the launched lane', () => {
  const launch = parseTuneLaunch(
    { laneKey: 'soulslike', anchorId: 10, recommendationId: 42, returnToForYou: true },
    LANES,
  )
  assert.equal(shouldReturnFromLaneDuel(launch, 'soulslike', 'left'), true)
})

test('shouldReturnFromLaneDuel is false for skip, lane mismatch, null launch, or no return flag', () => {
  const launch = parseTuneLaunch(
    { laneKey: 'soulslike', anchorId: 10, recommendationId: 42, returnToForYou: true },
    LANES,
  )
  assert.equal(shouldReturnFromLaneDuel(launch, 'soulslike', 'skip'), false)
  assert.equal(shouldReturnFromLaneDuel(launch, 'openworld', 'left'), false)
  assert.equal(shouldReturnFromLaneDuel(null, 'soulslike', 'left'), false)
  const noReturn = parseTuneLaunch(
    { laneKey: 'soulslike', anchorId: 10, recommendationId: 42, returnToForYou: false },
    LANES,
  )
  assert.equal(shouldReturnFromLaneDuel(noReturn, 'soulslike', 'left'), false)
})

test('resolveTuneLaunch prefers the pick evidence source as anchor', () => {
  const pick = {
    game: { id: 42 },
    evidence: { lane: 'soulslike', source: { masterId: 10 } },
  }
  const profile = fakeProfile([
    {
      key: 'soulslike',
      label: 'Soulslike',
      sources: [
        { masterId: 20, reaction: 'loved', comparisonCount: 5 },
        { masterId: 10, reaction: null, comparisonCount: 0 },
      ],
    },
  ])
  const launch = resolveTuneLaunch(pick, profile)
  assert.ok(launch)
  assert.equal(launch.laneKey, 'soulslike')
  assert.equal(launch.anchorId, 10)
  assert.equal(launch.recommendationId, 42)
  assert.equal(launch.returnToForYou, true)
})

test('resolveTuneLaunch falls back to the first lane source with a reaction or duel history', () => {
  const pick = { game: { id: 42 }, evidence: { lane: 'soulslike' } }
  const profile = fakeProfile([
    {
      key: 'soulslike',
      label: 'Soulslike',
      sources: [
        { masterId: 30, reaction: null, comparisonCount: 0 },
        { masterId: 20, reaction: 'liked', comparisonCount: 0 },
        { masterId: 25, reaction: null, comparisonCount: 3 },
      ],
    },
  ])
  const launch = resolveTuneLaunch(pick, profile)
  assert.ok(launch)
  assert.equal(launch.anchorId, 20)
})

test('resolveTuneLaunch falls back on comparisonCount alone', () => {
  const pick = { game: { id: 42 }, evidence: { lane: 'soulslike' } }
  const profile = fakeProfile([
    {
      key: 'soulslike',
      label: 'Soulslike',
      sources: [
        { masterId: 30, reaction: null, comparisonCount: 0 },
        { masterId: 25, reaction: null, comparisonCount: 3 },
      ],
    },
  ])
  const launch = resolveTuneLaunch(pick, profile)
  assert.ok(launch)
  assert.equal(launch.anchorId, 25)
})

test('resolveTuneLaunch returns null when there is no lane', () => {
  const pick = { game: { id: 42 }, evidence: { lane: 'roguelike' } }
  const profile = fakeProfile([{ key: 'soulslike', label: 'Soulslike', sources: [] }])
  assert.equal(resolveTuneLaunch(pick, profile), null)
})

test('resolveTuneLaunch returns null when the lane has no anchorable source', () => {
  const pick = { game: { id: 42 }, evidence: { lane: 'soulslike' } }
  const profile = fakeProfile([
    {
      key: 'soulslike',
      label: 'Soulslike',
      sources: [
        { masterId: 30, reaction: null, comparisonCount: 0 },
        { masterId: null, reaction: 'loved', comparisonCount: 4 },
      ],
    },
  ])
  // second source has a reaction but no id, first has an id but nothing to anchor on
  assert.equal(resolveTuneLaunch(pick, profile), null)
})

const receiptFixture = {
  recommendationId: 42,
  laneKey: 'soulslike',
  laneLabel: 'Soulslike',
  winnerId: 10,
  winnerTitle: 'W',
  loserId: 11,
  loserTitle: 'L',
}

test('lane duel receipt is consume-once with the duel card label', async () => {
  const accountProvider = async () => 'acct-1'
  assert.equal(await publishLaneDuelReceipt(receiptFixture, { accountProvider }), true)
  const receipt = await consumeLaneDuelReceipt({ accountProvider })
  assert.ok(receipt)
  assert.equal(receipt.cardLabel, 'Duel added: W over L')
  assert.equal(receipt.recommendationId, 42)
  assert.equal(receipt.laneKey, 'soulslike')
  // second consume is empty
  assert.equal(await consumeLaneDuelReceipt({ accountProvider }), null)
})

test('lane duel receipt expires after the TTL', async () => {
  const accountProvider = async () => 'acct-1'
  assert.equal(await publishLaneDuelReceipt(receiptFixture, { accountProvider }), true)
  const expired = await consumeLaneDuelReceipt({
    now: Date.now() + LANE_DUEL_RECEIPT_TTL_MS + 1,
    accountProvider,
  })
  assert.equal(expired, null)
})

test('lane duel receipt is scoped to the publishing account', async () => {
  await publishLaneDuelReceipt(receiptFixture, { accountProvider: async () => 'acct-1' })
  const receipt = await consumeLaneDuelReceipt({ accountProvider: async () => 'acct-2' })
  assert.equal(receipt, null)
})
