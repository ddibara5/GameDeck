const LABEL_ALIASES = new Map([
  ['role-playing (rpg)', 'RPG'],
  ['simulator', 'Simulation'],
  ["hack and slash/beat 'em up", 'Hack & slash'],
  ['platform', 'Platformer'],
])

export function wishlistGenreLabel(value) {
  const label = String(value || '').trim()
  if (!label) return ''
  return LABEL_ALIASES.get(label.toLowerCase()) || label
}

export function wishlistGenresFor(row, metadata) {
  const game = metadata && metadata[row && row.igdb_id]
  return [...new Set((game?.genres || []).map(wishlistGenreLabel).filter(Boolean))]
}

export function wishlistGenreOptions(rows, metadata) {
  const labels = new Set()
  for (const row of rows || []) {
    wishlistGenresFor(row, metadata).forEach((label) => labels.add(label))
  }
  return [...labels].sort((a, b) => a.localeCompare(b))
}

export function filterWishlistByGenre(rows, metadata, genre) {
  if (!genre || genre === 'all') return rows || []
  return (rows || []).filter((row) => wishlistGenresFor(row, metadata).includes(genre))
}
