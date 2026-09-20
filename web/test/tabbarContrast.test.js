import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

test('bottom navigation uses a more opaque dedicated material', () => {
  assert.match(css, /--nav-surface: color-mix\(in srgb, var\(--surface\) 94%, transparent\)/)
  assert.match(css, /\.tabbar,[\s\S]*\.global-search-trigger[\s\S]*background: var\(--nav-surface\)/)
  assert.match(css, /--nav-blur: blur\(16px\) saturate\(135%\)/)
})

test('every active theme defines navigation contrast', () => {
  for (const theme of ['curator', 'obsidian', 'xbox', 'playstation', 'cartridge']) {
    assert.match(
      css,
      new RegExp(":root\\[data-theme-family='" + theme + "'\\][\\s\\S]*?--nav-(?:surface|idle)"),
      theme + ' should define nav contrast',
    )
  }
})

test('tab labels and icons use stronger navigation-specific contrast tokens', () => {
  assert.match(css, /\.tabbar-btn\s*{[\s\S]*?color: var\(--nav-idle\)[\s\S]*?font-weight: var\(--w-semi\)/)
  assert.match(css, /\.tabbar-btn\.active\s*{[\s\S]*?color: var\(--nav-active\)[\s\S]*?font-weight: var\(--w-bold\)/)
  assert.match(css, /\.tabbar-btn\.active \.tabbar-icon\s*{[\s\S]*?color: var\(--nav-active-icon\)/)
  assert.match(css, /\.global-search-trigger\s*{[\s\S]*?color: var\(--nav-idle\)/)
})
