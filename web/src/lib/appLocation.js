const SEARCH_SCOPES = new Set(['all', 'library', 'catalog', 'wishlist'])
const VIEWS = new Set(['wishlist', 'releases', 'released', 'backlog', 'playing', 'finished'])

export function defaultSearchScope({ activeTab, view } = {}) {
  if (view === 'wishlist') return 'wishlist'
  if (activeTab === 'library') return 'library'
  if (activeTab === 'discover') return 'catalog'
  return 'all'
}

export function readAppLocation(href, validTabs, fallbackTab) {
  const url = new URL(href, 'https://gamedeck.local')
  const requestedTab = url.searchParams.get('tab')
  const requestedView = url.searchParams.get('view')
  const requestedScope = url.searchParams.get('scope')
  return {
    tab: validTabs.has(requestedTab) ? requestedTab : fallbackTab,
    view: VIEWS.has(requestedView) ? requestedView : null,
    searchOpen: url.searchParams.get('search') === '1',
    searchScope: SEARCH_SCOPES.has(requestedScope) ? requestedScope : null,
  }
}

export function buildAppLocation(href, { tab, view, searchOpen, searchScope }) {
  const url = new URL(href, 'https://gamedeck.local')
  if (tab) url.searchParams.set('tab', tab)
  else url.searchParams.delete('tab')
  if (view) url.searchParams.set('view', view)
  else url.searchParams.delete('view')
  if (searchOpen) {
    url.searchParams.set('search', '1')
    if (SEARCH_SCOPES.has(searchScope)) url.searchParams.set('scope', searchScope)
    else url.searchParams.delete('scope')
  } else {
    url.searchParams.delete('search')
    url.searchParams.delete('scope')
  }
  return `${url.pathname}${url.search}${url.hash}`
}

export function filterTitleMatches(items, query, titleOf, limit = Infinity) {
  const needle = String(query || '').trim().toLocaleLowerCase()
  if (!needle) return []
  const matches = []
  for (const item of items || []) {
    const title = String(titleOf(item) || '')
    if (title.toLocaleLowerCase().includes(needle)) matches.push(item)
    if (matches.length >= limit) break
  }
  return matches
}
