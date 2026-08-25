import test from 'node:test'
import assert from 'node:assert/strict'
import { swr } from '../src/lib/idbCache.js'

test('concurrent callers share one revalidation for the same cache key', async () => {
  let calls = 0
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const fetcher = async () => {
    calls += 1
    await gate
    return ['fresh']
  }

  const first = swr('dedup:same', fetcher)
  const second = swr('dedup:same', fetcher)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls, 1)

  release()
  const results = await Promise.all([first, second])
  assert.deepEqual(results.map((result) => result.value), [['fresh'], ['fresh']])
})

test('different cache keys can revalidate independently', async () => {
  let calls = 0
  const fetcher = async () => {
    calls += 1
    return calls
  }

  await Promise.all([swr('dedup:a', fetcher), swr('dedup:b', fetcher)])
  assert.equal(calls, 2)
})
