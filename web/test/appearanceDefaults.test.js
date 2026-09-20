import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getTheme } from '../src/lib/theme.js'

function storage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
}

test('light is the default appearance when no mode has been saved', () => {
  const prior = globalThis.localStorage
  globalThis.localStorage = storage()
  try {
    assert.equal(getTheme(), 'light')
  } finally {
    globalThis.localStorage = prior
  }
})

test('an explicit saved mode still wins over the light default', () => {
  const prior = globalThis.localStorage
  globalThis.localStorage = storage({ gamedeck_theme_v1: 'dark' })
  try {
    assert.equal(getTheme(), 'dark')
  } finally {
    globalThis.localStorage = prior
  }
})

test('theme typography maps headings and supporting copy to semantic families', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  assert.match(css, /--font-heading:\s*var\(--font-display\)/)
  assert.match(css, /--font-supporting:\s*var\(--font-body\)/)
  for (const selector of ['.brand-title', '.hm-sec-title', '.hrail-title', '.discover-section-label', '.gd-library-count', '.news-week-label', '.game-page-title']) {
    assert.ok(css.includes(selector), selector + ' should use the shared heading family')
  }
})
