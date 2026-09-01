import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyProductionScale,
  filterByProductionScale,
  selectedProductionScales,
} from '../src/lib/productionScale.js'

const games = [
  {
    id: 1,
    name: 'Major release',
    genres: [{ name: 'Adventure' }],
    involved_companies: [{ company: { name: 'Xbox Game Studios' } }],
  },
  {
    id: 2,
    name: 'Small release',
    genres: [{ name: 'Indie' }],
    involved_companies: [{ company: { name: 'Tiny Team' } }],
  },
  {
    id: 3,
    name: 'Mid-market release',
    genres: [{ name: 'Role-playing (RPG)' }],
    involved_companies: [{ company: { name: 'Focused Publisher' } }],
  },
]

test('classifies production scale from company and genre metadata', () => {
  assert.equal(classifyProductionScale(games[0]), 'aaa')
  assert.equal(classifyProductionScale(games[1]), 'indie')
  assert.equal(classifyProductionScale(games[2]), 'aa')
})

test('major-company context takes precedence over an Indie genre tag', () => {
  assert.equal(
    classifyProductionScale({
      genres: ['Indie'],
      companies: [{ name: 'Sony Interactive Entertainment' }],
    }),
    'aaa'
  )
})

test('filters any included production-scale combination', () => {
  assert.deepEqual(filterByProductionScale(games, 'aaa,aa').map((game) => game.id), [1, 3])
  assert.deepEqual(filterByProductionScale(games, 'indie').map((game) => game.id), [2])
  assert.deepEqual(filterByProductionScale(games, 'none'), [])
  assert.equal(filterByProductionScale(games, undefined), games)
})

test('ignores unsupported scale values', () => {
  assert.deepEqual([...selectedProductionScales('aaa,unknown')], ['aaa'])
})

