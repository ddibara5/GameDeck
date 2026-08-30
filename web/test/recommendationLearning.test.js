import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('recommendation learning is append-only, owner-scoped, and security-invoker', async () => {
  const migration = await readFile(
    new URL('../../supabase/migrations/20260827023226_recommendation_outcome_learning.sql', import.meta.url),
    'utf8',
  )
  assert.match(migration, /alter table public\.recommendation_exposures enable row level security/)
  assert.match(migration, /owner_insert_recommendation_exposures/)
  assert.match(migration, /with \(security_invoker = true\)/)
  assert.match(migration, /grant select, insert on public\.recommendation_exposures/)
  assert.doesNotMatch(migration, /grant select, insert, update/)
})

test('For You records impressions and opens without blocking navigation', async () => {
  const component = await readFile(new URL('../src/components/DiscoverForYou.jsx', import.meta.url), 'utf8')
  const learning = await readFile(new URL('../src/lib/recommendationLearning.js', import.meta.url), 'utf8')
  assert.match(component, /trackRecommendationFeed/)
  assert.match(component, /recordRecommendationDetailOpen/)
  assert.match(learning, /ignoreDuplicates: true/)
  assert.match(learning, /\.catch\(\(\) => \{\}\)/)
})

test('manual refresh keeps the prior feed and creates a distinct learning batch', async () => {
  const component = await readFile(new URL('../src/components/DiscoverForYou.jsx', import.meta.url), 'utf8')
  const learning = await readFile(new URL('../src/lib/recommendationLearning.js', import.meta.url), 'utf8')
  const discover = await readFile(new URL('../src/lib/discover.js', import.meta.url), 'utf8')

  assert.match(component, /Refresh picks/)
  assert.match(component, /force: true/)
  assert.match(component, /Showing your previous picks/)
  assert.match(component, /batchId: feedBatch/)
  assert.match(learning, /batchId = 'initial'/)
  assert.match(discover, /if \(force\)/)
})
