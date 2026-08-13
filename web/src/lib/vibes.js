// Curated keyword chips, shared by the shuffler and the Library filter.
//
// These live here rather than in shuffle.js because both surfaces need them and
// the Library should not have to import the shuffler's selection rules to filter
// by "soulslike".
//
// They come from `games.keywords` and NOT from `games.genre`, because genre holds
// exactly ONE IGDB genre per row: Dark Souls, Elden Ring and Persona are all
// `Role-playing (RPG)` and cannot be told apart by it. Soulslike is an IGDB
// keyword, never a genre. Each entry lists every spelling IGDB uses, since it is
// not consistent.
export const VIBES = [
  { key: 'soulslike', label: 'Soulslike', terms: ['souls-like', 'soulslike'] },
  { key: 'openworld', label: 'Open world', terms: ['open world'] },
  { key: 'stealth', label: 'Stealth', terms: ['stealth'] },
  { key: 'postapoc', label: 'Post-apocalyptic', terms: ['post-apocalyptic'] },
  { key: 'horror', label: 'Horror', terms: ['horror', 'survival horror'] },
  { key: 'story', label: 'Story rich', terms: ['story rich'] },
]

export function hasVibe(game, vibeKey) {
  const v = VIBES.find((x) => x.key === vibeKey)
  if (!v) return true
  const kw = (game && game.keywords) || []
  return v.terms.some((t) => kw.indexOf(t) >= 0)
}

// Only offer a chip that can actually return something. A filter that always
// yields an empty list is worse than no filter at all.
//
// NOTE: this reads `keywords`, so whatever query feeds it MUST select that column.
// The Library used to run its own SELECT that omitted it, which would have made
// every chip return nothing while looking perfectly healthy.
export function availableVibes(games, min = 5) {
  return VIBES.filter((v) => games.filter((g) => hasVibe(g, v.key)).length >= min)
}
