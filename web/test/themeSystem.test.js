import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { THEME_FAMILIES, getThemeFamily, setThemeFamily } from '../src/lib/theme.js'

test('the five visual families each have complete CSS token systems', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  assert.deepEqual(
    THEME_FAMILIES.map(({ key, label }) => [key, label]),
    [
      ['curator', 'Curator'],
      ['obsidian', 'Obsidian Glass'],
      ['neon', 'Neon Cabinet'],
      ['blueprint', 'Blueprint'],
      ['cartridge', 'Cartridge'],
    ],
  )

  for (const { key } of THEME_FAMILIES) {
    assert.match(css, new RegExp(`data-theme-family=["']${key}["']`))
  }
  for (const token of ['--font-display', '--theme-ground', '--r-md', '--e2', '--d-base']) {
    assert.match(css, new RegExp(token))
  }
  assert.doesNotMatch(css, /data-ground=/)
  assert.doesNotMatch(css, /data-accent=/)
})

test('legacy accents migrate and retired background state is removed', () => {
  const priorDocument = globalThis.document
  const priorStorage = globalThis.localStorage
  const values = new Map([
    ['gamedeck_accent_v1', 'sage'],
    ['gamedeck_ground_v1', 'glow'],
    ['gamedeck_ground_pin_v1', '{"master_id":"game-1"}'],
  ])
  const attrs = new Map([['data-ground', 'glow'], ['data-accent', 'sage']])
  const inline = new Map([['--ground-src', 'url("old")']])

  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
  globalThis.document = {
    documentElement: {
      setAttribute: (key, value) => attrs.set(key, String(value)),
      removeAttribute: (key) => attrs.delete(key),
      style: { removeProperty: (key) => inline.delete(key) },
    },
  }

  try {
    assert.equal(getThemeFamily(), 'blueprint')
    assert.equal(values.get('gamedeck_visual_theme_v2'), 'blueprint')
    assert.equal(values.has('gamedeck_accent_v1'), false)

    assert.equal(setThemeFamily('blueprint'), 'blueprint')
    assert.equal(attrs.get('data-theme-family'), 'blueprint')
    assert.equal(values.has('gamedeck_ground_v1'), false)
    assert.equal(values.has('gamedeck_ground_pin_v1'), false)
    assert.equal(attrs.has('data-ground'), false)
    assert.equal(attrs.has('data-accent'), false)
    assert.equal(inline.size, 0)

    assert.equal(setThemeFamily('unknown'), 'curator')
    assert.equal(attrs.get('data-theme-family'), 'curator')
  } finally {
    globalThis.document = priorDocument
    globalThis.localStorage = priorStorage
  }
})
