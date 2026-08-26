import assert from 'node:assert/strict'
import test from 'node:test'

import { GAMEPASS_STALE_MS, gamePassCatalogAvailable, normalizeGamePassState } from '../src/lib/gamePassState.js'

const NOW = Date.parse('2026-08-26T12:00:00Z')

test('a populated, fresh Game Pass catalog is available even with no leaving titles', () => {
  assert.equal(gamePassCatalogAvailable(499, '2026-08-26T05:00:00Z', NOW), true)
})

test('an empty catalog is unavailable rather than a healthy empty state', () => {
  assert.equal(gamePassCatalogAvailable(0, '2026-08-26T05:00:00Z', NOW), false)
})

test('a catalog older than the refresh grace period is unavailable', () => {
  assert.equal(gamePassCatalogAvailable(499, new Date(NOW - GAMEPASS_STALE_MS - 1).toISOString(), NOW), false)
})

test('legacy cached rows remain usable while an empty legacy cache signals an outage', () => {
  assert.deepEqual(normalizeGamePassState([{ igdb_id: 1 }]), {
    rows: [{ igdb_id: 1 }],
    available: true,
    updatedAt: null,
  })
  assert.deepEqual(normalizeGamePassState([]), { rows: [], available: false, updatedAt: null })
})
