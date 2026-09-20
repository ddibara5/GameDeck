import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getLogoStyle, setLogoStyle } from '../src/lib/theme.js'

test('logo style defaults safely and persists a valid choice', () => {
  const priorDocument = globalThis.document
  const priorStorage = globalThis.localStorage
  const values = new Map()
  const attrs = new Map()

  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
  globalThis.document = {
    documentElement: {
      setAttribute: (key, value) => attrs.set(key, String(value)),
    },
  }

  try {
    assert.equal(getLogoStyle(), 'theme')
    assert.equal(setLogoStyle('glass'), 'glass')
    assert.equal(getLogoStyle(), 'glass')
    assert.equal(attrs.get('data-logo-style'), 'glass')

    assert.equal(setLogoStyle('unknown'), 'theme')
    assert.equal(values.get('gamedeck_logo_style_v1'), 'theme')
    assert.equal(attrs.get('data-logo-style'), 'theme')
  } finally {
    globalThis.document = priorDocument
    globalThis.localStorage = priorStorage
  }
})

test('all in-app brand surfaces use the shared theme-aware mark', () => {
  const brand = readFileSync(new URL('../src/components/Brand.jsx', import.meta.url), 'utf8')
  const mark = readFileSync(new URL('../src/components/LogoMark.jsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

  assert.match(brand, /<LogoMark className="brand-mark"/)
  assert.match(mark, /logo-classic/)
  assert.match(mark, /logo-glass/)
  assert.match(css, /data-logo-style=["']glass["']/)
  assert.match(css, /data-logo-style=["']theme["']/)
  for (let i = 1; i <= 7; i += 1) assert.match(css, new RegExp(`--logo-${i}`))
})

test('one-time migration moves a stored glass logo style back to theme default', async () => {
  const { initTheme, getLogoStyle } = await import('../src/lib/theme.js')
  const priorDocument = globalThis.document
  const priorStorage = globalThis.localStorage
  const priorWindow = globalThis.window
  const values = new Map([['gamedeck_logo_style_v1', 'glass']])
  const attrs = new Map()

  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
  globalThis.document = {
    documentElement: {
      setAttribute: (key, value) => attrs.set(key, String(value)),
      removeAttribute: (key) => attrs.delete(key),
      style: { removeProperty() {} },
    },
  }
  globalThis.window = { matchMedia: () => ({ addEventListener() {} }) }

  try {
    initTheme()
    assert.equal(values.get('gamedeck_logo_style_v1'), 'theme')
    assert.equal(getLogoStyle(), 'theme')
    assert.equal(attrs.get('data-logo-style'), 'theme')

    // A later explicit pick of glass is respected (migration runs once).
    values.set('gamedeck_logo_style_v1', 'glass')
    initTheme()
    assert.equal(values.get('gamedeck_logo_style_v1'), 'glass')
    assert.equal(getLogoStyle(), 'glass')
  } finally {
    globalThis.document = priorDocument
    globalThis.localStorage = priorStorage
    globalThis.window = priorWindow
  }
})
