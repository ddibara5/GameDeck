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
    assert.equal(getLogoStyle(), 'classic')
    assert.equal(setLogoStyle('glass'), 'glass')
    assert.equal(getLogoStyle(), 'glass')
    assert.equal(attrs.get('data-logo-style'), 'glass')

    assert.equal(setLogoStyle('unknown'), 'classic')
    assert.equal(values.get('gamedeck_logo_style_v1'), 'classic')
    assert.equal(attrs.get('data-logo-style'), 'classic')
  } finally {
    globalThis.document = priorDocument
    globalThis.localStorage = priorStorage
  }
})

test('all in-app brand surfaces use the shared theme-aware mark', () => {
  const brand = readFileSync(new URL('../src/components/Brand.jsx', import.meta.url), 'utf8')
  const menu = readFileSync(new URL('../src/components/Menu.jsx', import.meta.url), 'utf8')
  const mark = readFileSync(new URL('../src/components/LogoMark.jsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

  assert.match(brand, /<LogoMark className="brand-mark"/)
  assert.match(menu, /<LogoMark className="drawer-logo-mark"/)
  assert.match(mark, /logo-classic/)
  assert.match(mark, /logo-glass/)
  assert.match(css, /data-logo-style=["']glass["']/)
  for (let i = 1; i <= 7; i += 1) assert.match(css, new RegExp(`--logo-${i}`))
})
