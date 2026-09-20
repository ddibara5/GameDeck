import assert from 'node:assert/strict'
import test from 'node:test'
import { THEME_FAMILIES } from '../src/lib/theme.js'

test('theme picker exposes only the five distinct supported families', () => {
  assert.deepEqual(
    THEME_FAMILIES.map((theme) => theme.key),
    ['curator', 'obsidian', 'xbox', 'playstation', 'cartridge'],
  )
  assert.equal(new Set(THEME_FAMILIES.map((theme) => theme.key)).size, THEME_FAMILIES.length)
})

test('theme picker copy stays compact', () => {
  for (const theme of THEME_FAMILIES) {
    assert.ok(theme.label.length <= 12, `${theme.key} label is concise`)
    assert.ok(theme.description.length <= 40, `${theme.key} description is concise`)
  }
})
