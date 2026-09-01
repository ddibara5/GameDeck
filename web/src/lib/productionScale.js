// IGDB does not publish a first-class AA / AAA / indie field. GameDeck keeps
// the useful three-way filter deterministic by combining the catalog's Indie
// genre with a conservative list of major publishers and platform holders:
//
//   1. A major-company match is AAA.
//   2. Otherwise IGDB's Indie genre is Indie.
//   3. The remaining mid-market catalog is AA.
//
// The order matters. A small game released by a major label can carry IGDB's
// Indie genre, but its production/distribution context is still the more useful
// signal for this filter. Keep this shared between the API and the client so
// cached wishlist metadata is classified exactly like live Discover results.

export const PRODUCTION_SCALES = [
  { key: 'aaa', label: 'AAA' },
  { key: 'aa', label: 'AA' },
  { key: 'indie', label: 'Indie' },
]

export const PRODUCTION_SCALE_KEYS = PRODUCTION_SCALES.map((scale) => scale.key)

const AAA_COMPANY_MARKERS = [
  '2k games',
  'activision',
  'bandai namco',
  'bethesda',
  'blizzard',
  'capcom',
  'cd projekt',
  'electronic arts',
  'ea sports',
  'epic games',
  'fromsoftware',
  'guerrilla games',
  'insomniac games',
  'konami',
  'microsoft studios',
  'naughty dog',
  'nintendo',
  'playstation studios',
  'rockstar games',
  'santa monica studio',
  'sega',
  'sony interactive entertainment',
  'square enix',
  'take-two interactive',
  'ubisoft',
  'warner bros. games',
  'wb games',
  'xbox game studios',
]

function companyNames(game) {
  if (Array.isArray(game?.companies)) {
    return game.companies.map((entry) => String(entry?.name || '').toLowerCase()).filter(Boolean)
  }
  if (Array.isArray(game?.involved_companies)) {
    return game.involved_companies
      .map((entry) => String(entry?.company?.name || '').toLowerCase())
      .filter(Boolean)
  }
  return []
}

function genreNames(game) {
  return (game?.genres || [])
    .map((genre) => String(typeof genre === 'string' ? genre : genre?.name || '').toLowerCase())
    .filter(Boolean)
}

export function classifyProductionScale(game) {
  const companies = companyNames(game)
  if (companies.some((name) => AAA_COMPANY_MARKERS.some((marker) => name.includes(marker)))) return 'aaa'
  if (genreNames(game).includes('indie')) return 'indie'
  return 'aa'
}

export function selectedProductionScales(value) {
  if (value == null || value === '' || value === 'all') return null
  if (value === 'none') return new Set()
  return new Set(
    String(value)
      .split(',')
      .map((key) => key.trim().toLowerCase())
      .filter((key) => PRODUCTION_SCALE_KEYS.includes(key))
  )
}

export function filterByProductionScale(games, value) {
  const selected = selectedProductionScales(value)
  if (selected === null) return games
  if (!selected.size) return []
  return (games || []).filter((game) => selected.has(classifyProductionScale(game)))
}

