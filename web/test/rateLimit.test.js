import test from 'node:test'
import assert from 'node:assert/strict'
import { rateLimit } from '../api/_rateLimit.js'

test('rate limits a key and reports a retry delay', () => {
  const key = `limit-${Math.random()}`
  assert.equal(rateLimit(key, { limit: 2, windowMs: 10_000 }).allowed, true)
  assert.equal(rateLimit(key, { limit: 2, windowMs: 10_000 }).allowed, true)
  const denied = rateLimit(key, { limit: 2, windowMs: 10_000 })
  assert.equal(denied.allowed, false)
  assert.ok(denied.retryAfter >= 1)
})

test('different callers use independent buckets', () => {
  const key = `independent-${Math.random()}`
  assert.equal(rateLimit(`${key}-a`, { limit: 1, windowMs: 10_000 }).allowed, true)
  assert.equal(rateLimit(`${key}-a`, { limit: 1, windowMs: 10_000 }).allowed, false)
  assert.equal(rateLimit(`${key}-b`, { limit: 1, windowMs: 10_000 }).allowed, true)
})
