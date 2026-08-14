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

// `kwMap` is the sidecar from useVibeKeywords(): master_id -> keywords. Library
// rows no longer carry keywords inline, because at 234 kB they were a third of
// the library payload and only these two surfaces read them.
//
// The fallback to game.keywords is not dead code. The shuffler also filters
// Discover/wishlist items, which are not library rows, have no master_id, and
// carry their own keywords from the IGDB fetch.
export function hasVibe(game, vibeKey, kwMap) {
  const v = VIBES.find((x) => x.key === vibeKey)
  if (!v) return true
  const fromMap = kwMap && game && game.master_id != null ? kwMap.get(String(game.master_id)) : null
  const kw = fromMap || (game && game.keywords) || []
  return v.terms.some((t) => kw.indexOf(t) >= 0)
}

// Only offer a chip that can actually return something. A filter that always
// yields an empty list is worse than no filter at all.
//
// NOTE: this reads keywords, so a caller working with library rows MUST pass the
// map from useVibeKeywords(). Until it loads this returns no chips, which is the
// correct empty state; what it must never do is return chips that match nothing.
// The Library used to run its own SELECT that omitted the column, which would
// have made every chip return nothing while looking perfectly healthy.
export function availableVibes(games, min = 5, kwMap) {
  return VIBES.filter((v) => games.filter((g) => hasVibe(g, v.key, kwMap)).length >= min)
}
