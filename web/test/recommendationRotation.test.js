import assert from 'node:assert/strict'
import test from 'node:test'

import {
  dailyRecommendationBatch,
  loadRotationExclusions,
  refreshRecommendationBatch,
  rememberRotationExclusions,
} from '../src/lib/recommendationRotation.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('daily rotation survives relaunches and expires on the next local day', () => {
  const storage = memoryStorage()
  const morning = new Date(2026, 8, 1, 9, 0).getTime()
  const evening = new Date(2026, 8, 1, 20, 0).getTime()
  const tomorrow = new Date(2026, 8, 2, 9, 0).getTime()

  rememberRotationExclusions([10, 11], morning, storage)
  assert.deepEqual([...loadRotationExclusions(evening, storage)], ['10', '11'])
  assert.deepEqual([...loadRotationExclusions(tomorrow, storage)], [])
  assert.equal(dailyRecommendationBatch(morning), dailyRecommendationBatch(evening))
  assert.notEqual(dailyRecommendationBatch(morning), dailyRecommendationBatch(tomorrow))
})

test('rapid refreshes share a learning batch without losing rotation exclusions', () => {
  const storage = memoryStorage()
  const now = Date.parse('2026-09-01T12:01:00Z')
  const first = rememberRotationExclusions([1, 2], now, storage)
  const second = rememberRotationExclusions([3], now + 60000, storage)
  assert.deepEqual([...first], ['1', '2'])
  assert.deepEqual([...second], ['1', '2', '3'])
  assert.equal(refreshRecommendationBatch(now), refreshRecommendationBatch(now + 60000))
  assert.notEqual(refreshRecommendationBatch(now), refreshRecommendationBatch(now + 11 * 60000))
})
