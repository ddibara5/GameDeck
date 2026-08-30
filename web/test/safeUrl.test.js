import test from 'node:test'
import assert from 'node:assert/strict'
import { safeExternalUrl } from '../src/lib/safeUrl.js'

test('safeExternalUrl accepts and normalizes HTTP(S) destinations', () => {
  assert.equal(safeExternalUrl('https://example.com/games?id=4'), 'https://example.com/games?id=4')
  assert.equal(safeExternalUrl('  http://example.com/path  '), 'http://example.com/path')
})

test('safeExternalUrl rejects active, local, and malformed destinations', () => {
  assert.equal(safeExternalUrl('javascript:alert(1)'), null)
  assert.equal(safeExternalUrl('data:text/html,<script>alert(1)</script>'), null)
  assert.equal(safeExternalUrl('/relative/path'), null)
  assert.equal(safeExternalUrl('not a url'), null)
  assert.equal(safeExternalUrl(null), null)
})
