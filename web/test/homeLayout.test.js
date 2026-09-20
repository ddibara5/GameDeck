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

// In-memory localStorage shim: the module reads storage at call time, so a
// test-scoped shim is enough.
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

test('the section catalog holds the five redesigned sections', () => {
  assert.deepEqual(SECTION_IDS, [
    'continue-playing',
    'jump-back-in',
    'top-story',
    'upcoming',
    'new-releases',
  ])
})

test('the layout uses a v2 storage key', () => {
  assert.equal(HOME_LAYOUT_KEY, 'gamedeck_home_layout_v2')
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
      order: ['upcoming', 'bogus', 'jump-back-in', 'upcoming', 'gone'],
      hidden: ['top-story', 'bogus', 'top-story'],
    }),
  )
  globalThis.localStorage = storage
  try {
    assert.deepEqual(loadHomeLayout(), {
      // User order survives; unknown ids are gone; sections missing from the
      // stored order are appended in catalog order.
      order: ['upcoming', 'jump-back-in', 'continue-playing', 'top-story', 'new-releases'],
      hidden: ['top-story'],
    })
  } finally {
    delete globalThis.localStorage
  }
})

test('load appends defaults to a partial stored order', () => {
  const storage = makeStorage()
  storage.setItem(HOME_LAYOUT_KEY, JSON.stringify({ order: ['top-story'], hidden: [] }))
  globalThis.localStorage = storage
  try {
    assert.deepEqual(loadHomeLayout().order, [
      'top-story',
      'continue-playing',
      'jump-back-in',
      'upcoming',
      'new-releases',
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
      order: ['upcoming', 'bogus', 'jump-back-in', 'upcoming'],
      hidden: ['top-story', 'bogus'],
    })
    assert.deepEqual(JSON.parse(storage.getItem(HOME_LAYOUT_KEY)), {
      order: ['upcoming', 'jump-back-in', 'continue-playing', 'top-story', 'new-releases'],
      hidden: ['top-story'],
    })
  } finally {
    delete globalThis.localStorage
  }
})

test('a round trip preserves a valid layout exactly', () => {
  const storage = makeStorage()
  globalThis.localStorage = storage
  const layout = {
    order: ['upcoming', 'continue-playing', 'jump-back-in', 'top-story', 'new-releases'],
    hidden: ['top-story'],
  }
  try {
    saveHomeLayout(layout)
    assert.deepEqual(loadHomeLayout(), layout)
    resetHomeLayout()
    assert.deepEqual(loadHomeLayout(), defaultHomeLayout)
  } finally {
    delete globalThis.localStorage
  }
})
