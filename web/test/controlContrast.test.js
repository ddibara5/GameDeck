import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const indexCss = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const homeCss = readFileSync(new URL('../src/components/HomeCustomizer.css', import.meta.url), 'utf8')
const rowsCss = readFileSync(new URL('../src/components/customizeRows.css', import.meta.url), 'utf8')
const discoverCss = readFileSync(new URL('../src/components/discover.css', import.meta.url), 'utf8')

test('stateful controls use dedicated contrast tokens', () => {
  for (const token of [
    '--control-track-bg',
    '--control-track-border',
    '--control-idle-text',
    '--control-selected-bg',
    '--control-selected-text',
    '--control-selected-border',
    '--control-accent-bg',
    '--control-accent-ink',
    '--control-switch-off',
    '--control-switch-on',
  ]) {
    assert.ok(indexCss.includes(token), token + ' should be defined')
  }
})

test('all five active themes tune control contrast in dark and light modes', () => {
  for (const theme of ['curator', 'obsidian', 'xbox', 'playstation', 'cartridge']) {
    assert.match(indexCss, new RegExp(":root\\[data-theme-family='" + theme + "'\\]\\s*\\{[\\s\\S]*?--control-idle-text"))
    assert.match(indexCss, new RegExp(":root\\[data-theme-family='" + theme + "'\\]\\[data-theme='light'\\]\\s*\\{[\\s\\S]*?--control-idle-text"))
  }
})

test('segmented, choice and switch controls consume shared contrast states', () => {
  assert.match(indexCss, /\.seg-btn\.active,[\s\S]*?\.global-search-modebar button\.active,[\s\S]*?\.preset-chip\.active/)
  assert.match(indexCss, /\.filter-opt\.active,[\s\S]*?\.chip\.active[\s\S]*?var\(--control-accent-ink\)/)
  assert.match(homeCss, /background: var\(--control-switch-off\)/)
  assert.match(homeCss, /background: var\(--control-switch-on\)/)
  assert.match(rowsCss, /background: var\(--control-switch-off\)/)
  assert.match(rowsCss, /background: var\(--control-switch-on\)/)
  assert.match(discoverCss, /\.preset-chip\.active[\s\S]*?var\(--control-selected-bg\)/)
})
