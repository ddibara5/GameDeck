import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sheet = readFileSync(new URL('../src/components/NewsSheet.jsx', import.meta.url), 'utf8')

test('News story wishlist action follows live wishlist state', () => {
  assert.match(sheet, /useWishlist\(\)/)
  assert.match(sheet, /wishlistIds\.has\(gameId\)/)
  assert.match(sheet, /aria-busy=\{adding\}/)
  assert.match(sheet, /await addToWishlist/)
  assert.match(sheet, /adding \? 'Adding…' : '\+ Wishlist'/)
})

test('News story does not render a dead wishlist action without a game id', () => {
  assert.match(sheet, /!owned && gameId > 0/)
})
