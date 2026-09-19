import assert from 'node:assert/strict'
import test from 'node:test'
import {
  HOME_LAYOUT_KEY,
  defaultHomeLayout,
  homeSectionOptions,
  loadHomeLayout,
  resetHomeLayout,
  saveHomeLayout,
} from '../src/lib/homeLayout.js'

// In-memory localStorage shim, following the navConfig.test.js pattern: the
// module reads storage at call time, so a test-scoped shim is enough.
function makeStorage() {
  const store = new Map()
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  }
}

const SECTION_IDS = homeSectionOptions.map((option) => option.id)

test('the section catalog holds the four pilot sections', () => {
  assert.deepEqual(SECTION_IDS, ['statistics', 'recent-play', 'new-releases', 'upcoming'])
})

test('the default layout shows every section in catalog order', () => {
  assert.deepEqual(defaultHomeLayout.order, SECTION_IDS)
  assert.deepEqual(defaultHomeLayout.hidden, [])
})

test('load falls back to the default when nothing is stored', () => {
  globalThis.localStorage = makeStorage()
  try {
    assert.deepEqual(loadHomeLayout(), defaultHomeLayout)
  } finally {
    delete globalThis.localStorage
  }
})

test('load falls back to the default on corrupt JSON', () => {
  const storage = makeStorage()
  storage.setItem(HOME_LAYOUT_KEY, 'not-json{{{')
  globalThis.localStorage = storage
  try {
    assert.deepEqual(loadHomeLayout(), defaultHomeLayout)
  } finally {
    delete globalThis.localStorage
  }
})

test('load drops unknown ids and dedupes the order', () => {
  const storage = makeStorage()
  storage.setItem(
    HOME_LAYOUT_KEY,
    JSON.stringify({
      order: ['upcoming', 'bogus', 'recent-play', 'upcoming', 'gone'],
      hidden: ['new-releases', 'bogus', 'new-releases'],
    }),
  )
  globalThis.localStorage = storage
  try {
    assert.deepEqual(loadHomeLayout(), {
      // User order survives; unknown ids are gone; sections missing from the
      // stored order are appended in catalog order.
      order: ['upcoming', 'recent-play', 'statistics', 'new-releases'],
      hidden: ['new-releases'],
    })
  } finally {
    delete globalThis.localStorage
  }
})

test('load appends defaults to a partial stored order', () => {
  const storage = makeStorage()
  storage.setItem(HOME_LAYOUT_KEY, JSON.stringify({ order: ['recent-play'], hidden: [] }))
  globalThis.localStorage = storage
  try {
    assert.deepEqual(loadHomeLayout().order, [
      'recent-play',
      'statistics',
      'new-releases',
      'upcoming',
    ])
  } finally {
    delete globalThis.localStorage
  }
})

test('save normalizes before writing to storage', () => {
  const storage = makeStorage()
  globalThis.localStorage = storage
  try {
    saveHomeLayout({
      order: ['upcoming', 'bogus', 'statistics', 'upcoming'],
      hidden: ['recent-play', 'bogus'],
    })
    assert.deepEqual(JSON.parse(storage.getItem(HOME_LAYOUT_KEY)), {
      order: ['upcoming', 'statistics', 'recent-play', 'new-releases'],
      hidden: ['recent-play'],
    })
  } finally {
    delete globalThis.localStorage
  }
})

test('a round trip preserves a valid layout exactly', () => {
  const storage = makeStorage()
  globalThis.localStorage = storage
  const layout = { order: ['upcoming', 'statistics', 'recent-play', 'new-releases'], hidden: ['statistics'] }
  try {
    saveHomeLayout(layout)
    assert.deepEqual(loadHomeLayout(), layout)
    resetHomeLayout()
    assert.deepEqual(loadHomeLayout(), defaultHomeLayout)
  } finally {
    delete globalThis.localStorage
  }
})
