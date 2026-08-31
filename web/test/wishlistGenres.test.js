import test from 'node:test'
import assert from 'node:assert/strict'
import {
  filterWishlistByGenre,
  wishlistGenreLabel,
  wishlistGenreOptions,
} from '../src/lib/wishlistGenres.js'

const rows = [{ igdb_id: 1 }, { igdb_id: 2 }, { igdb_id: 3 }]
const metadata = {
  1: { genres: ['Role-playing (RPG)', 'Adventure'] },
  2: { genres: ['Strategy', 'Simulator'] },
  3: { genres: ['Strategy', 'Role-playing (RPG)'] },
}

test('wishlist genres use concise GameDeck labels', () => {
  assert.equal(wishlistGenreLabel('Role-playing (RPG)'), 'RPG')
  assert.equal(wishlistGenreLabel('Simulator'), 'Simulation')
  assert.equal(wishlistGenreLabel("Hack and slash/Beat 'em up"), 'Hack & slash')
})

test('wishlist genre options are deduplicated and alphabetical', () => {
  assert.deepEqual(
    wishlistGenreOptions(rows, metadata),
    ['Adventure', 'RPG', 'Simulation', 'Strategy'],
  )
})

test('wishlist genre filtering matches any genre on a game', () => {
  assert.deepEqual(filterWishlistByGenre(rows, metadata, 'RPG'), [rows[0], rows[2]])
  assert.deepEqual(filterWishlistByGenre(rows, metadata, 'Strategy'), [rows[1], rows[2]])
  assert.equal(filterWishlistByGenre(rows, metadata, 'all'), rows)
})
