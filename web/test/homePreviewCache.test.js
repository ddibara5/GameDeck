import assert from 'node:assert/strict'
import test from 'node:test'
import { FOR_YOU_FILTERS_KEY, getHomePreview, homePreviewKey, rememberHomePreview } from '../src/lib/homePreviewCache.js'

test('Home preview survives remounts, but not changed filters, expiry or an unavailable store', () => {
  const originalStorage = globalThis.localStorage
  const originalNow = Date.now
  const values = new Map()
  globalThis.localStorage = { getItem: key => values.get(key) ?? null }
  try {
    const now = originalNow()
    Date.now = () => now
    assert.equal(getHomePreview(), null)
    const snapshot = { deck: [{ id: 1 }] }
    const key = homePreviewKey()
    rememberHomePreview(snapshot, key)
    assert.equal(getHomePreview(), snapshot)
    values.set(FOR_YOU_FILTERS_KEY, '{"platforms":[6]}')
    assert.equal(getHomePreview(), null)
    // An old asynchronous response cannot be saved under the new filters.
    rememberHomePreview(snapshot, key)
    assert.equal(getHomePreview(), null)
    rememberHomePreview(snapshot, homePreviewKey())
    assert.equal(getHomePreview(), snapshot)
    Date.now = () => now + 300001
    assert.equal(getHomePreview(), null)
    Date.now = () => now
    globalThis.localStorage = { getItem: () => { throw new Error('Storage blocked') } }
    assert.equal(getHomePreview(), null)
  } finally {
    Date.now = originalNow
    if (originalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = originalStorage
  }
})
