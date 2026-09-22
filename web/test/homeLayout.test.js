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

test('the section catalog holds the seven Home sections', () => {
  assert.deepEqual(SECTION_IDS, [
    'insights-summary',
    'rankings-summary',
    'for-you',
    'new-releases',
    'top-story',
    'upcoming',
    'continue-playing',
  ])
})

test('the layout keeps the v2 storage key for in-place migration', () => {
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
      order: ['upcoming', 'bogus', 'insights-summary', 'upcoming', 'gone'],
      hidden: ['top-story', 'bogus', 'top-story'],
    }),
  )
  globalThis.localStorage = storage
  try {
    assert.deepEqual(loadHomeLayout(), {
      order: [
        'upcoming',
        'insights-summary',
        'for-you',
        'rankings-summary',
        'new-releases',
        'top-story',
        'continue-playing',
      ],
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
      'insights-summary',
      'rankings-summary',
      'for-you',
      'new-releases',
      'upcoming',
      'continue-playing',
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
      order: ['upcoming', 'bogus', 'rankings-summary', 'upcoming'],
      hidden: ['top-story', 'bogus'],
    })
    assert.deepEqual(JSON.parse(storage.getItem(HOME_LAYOUT_KEY)), {
      order: [
        'upcoming',
        'rankings-summary',
        'for-you',
        'insights-summary',
        'new-releases',
        'top-story',
        'continue-playing',
      ],
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
    order: [
      'upcoming',
      'continue-playing',
      'insights-summary',
      'rankings-summary',
      'for-you',
      'top-story',
      'new-releases',
    ],
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

test('legacy Jump back in expands to Insights then Rankings in place', () => {
  const storage = makeStorage()
  storage.setItem(
    HOME_LAYOUT_KEY,
    JSON.stringify({
      order: ['jump-back-in', 'new-releases', 'top-story', 'upcoming', 'continue-playing'],
      hidden: [],
    }),
  )
  globalThis.localStorage = storage
  try {
    assert.deepEqual(loadHomeLayout().order, [
      'insights-summary',
      'rankings-summary',
      'for-you',
      'new-releases',
      'top-story',
      'upcoming',
      'continue-playing',
    ])
  } finally {
    delete globalThis.localStorage
  }
})

test('a hidden legacy Jump back in hides both replacement cards', () => {
  const storage = makeStorage()
  storage.setItem(
    HOME_LAYOUT_KEY,
    JSON.stringify({
      order: ['jump-back-in', 'new-releases'],
      hidden: ['jump-back-in'],
    }),
  )
  globalThis.localStorage = storage
  try {
    assert.deepEqual(loadHomeLayout().hidden, ['insights-summary', 'rankings-summary'])
  } finally {
    delete globalThis.localStorage
  }
})
