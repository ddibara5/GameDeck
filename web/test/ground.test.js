import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { GROUND_OPTIONS, getGround, setGround } from '../src/lib/ground.js'

test('background presets stay limited to the four quiet palette-aware styles', () => {
  assert.deepEqual(
    GROUND_OPTIONS.map(({ key, label }) => [key, label]),
    [
      ['off', 'Flat'],
      ['wash', 'Soft wash'],
      ['glow', 'Ambient glow'],
      ['horizon', 'Horizon'],
    ],
  )
})

test('every non-flat preset has a CSS paint and artwork selectors are retired', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  for (const key of ['wash', 'glow', 'horizon']) {
    assert.match(css, new RegExp(`data-ground=['"]${key}['"]`))
  }
  assert.doesNotMatch(css, /data-ground-art/)
  assert.doesNotMatch(css, /--ground-src|--ground-veil/)
})

test('legacy artwork backgrounds migrate to Soft wash and clear retired state', () => {
  const priorDocument = globalThis.document
  const priorStorage = globalThis.localStorage
  const values = new Map([
    ['gamedeck_ground_v1', 'pinned'],
    ['gamedeck_ground_pin_v1', '{"master_id":"game-1"}'],
    ['gamedeck_ground_intensity_v1', '0.4'],
    ['gamedeck_ground_paint_v1', '{}'],
    ['gamedeck_accent_art_v1', '1'],
  ])
  const attrs = new Map([
    ['data-ground-art', ''],
    ['data-accent-art', ''],
  ])
  const inline = new Map([['--ground-src', 'url("old")'], ['--accent', 'rgb(1, 2, 3)']])

  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
  globalThis.document = {
    documentElement: {
      setAttribute: (key, value) => attrs.set(key, String(value)),
      removeAttribute: (key) => attrs.delete(key),
      style: {
        removeProperty: (key) => inline.delete(key),
      },
    },
  }

  try {
    assert.equal(getGround(), 'wash')
    assert.equal(values.get('gamedeck_ground_v1'), 'wash')
    assert.equal(values.has('gamedeck_ground_pin_v1'), false)
    assert.equal(values.has('gamedeck_ground_intensity_v1'), false)
    assert.equal(values.has('gamedeck_ground_paint_v1'), false)
    assert.equal(values.has('gamedeck_accent_art_v1'), false)
    assert.equal(attrs.has('data-ground-art'), false)
    assert.equal(attrs.has('data-accent-art'), false)
    assert.equal(inline.size, 0)

    assert.equal(setGround('glow'), 'glow')
    assert.equal(attrs.get('data-ground'), 'glow')
    assert.equal(values.get('gamedeck_ground_v1'), 'glow')

    assert.equal(setGround('unknown'), 'off')
    assert.equal(attrs.get('data-ground'), 'off')
  } finally {
    globalThis.document = priorDocument
    globalThis.localStorage = priorStorage
  }
})
