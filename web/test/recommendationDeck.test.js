import assert from 'node:assert/strict'
import test from 'node:test'

import {
  loadRecommendationDeck,
  recommendationDeckScope,
  restoreRecommendationDeck,
  saveRecommendationDeck,
} from '../src/lib/recommendationDeck.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  }
}

const NOW = Date.parse('2026-09-01T12:00:00Z')

test('daily deck position persists independently for each filter scope', () => {
  const storage = memoryStorage()
  const games = Array.from({ length: 12 }, (_, index) => ({ id: index + 1 }))
  const allScope = recommendationDeckScope({ platform: 'xbox', scale: 'aa,aaa,indie' })
  const indieScope = recommendationDeckScope({ platform: 'xbox', scale: 'indie' })

  assert.equal(saveRecommendationDeck({ scope: allScope, games, at: 4 }, NOW, storage), true)
  assert.equal(saveRecommendationDeck({ scope: indieScope, games: games.slice(0, 6), at: 1 }, NOW, storage), true)
  assert.equal(loadRecommendationDeck(allScope, NOW, storage).at, 4)
  assert.equal(loadRecommendationDeck(indieScope, NOW, storage).at, 1)
  assert.equal(loadRecommendationDeck(allScope, NOW + 86400000, storage), null)
})

test('a saved deck restores its current game and fills missing candidates safely', () => {
  const saved = { ids: ['1', '2', '3'], at: 1, batchNumber: 0, currentId: '2' }
  const restored = restoreRecommendationDeck(
    saved,
    [{ id: 2, name: 'Two' }, { id: 3, name: 'Three' }],
    [{ id: 4, name: 'Four' }],
  )
  assert.deepEqual(restored.games.map((game) => game.id), [2, 3, 4])
  assert.equal(restored.at, 0)
})

