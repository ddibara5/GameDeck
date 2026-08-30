import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import Cover from './Cover.jsx'
import GameSheet from './GameSheet.jsx'
import { LoadingState, MessageState } from './AsyncState.jsx'
import { fetchDiscover, normTitle } from '../lib/discover.js'
import { libraryCover, platformMeta } from '../lib/format.js'
import { filterTitleMatches } from '../lib/appLocation.js'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { useWishlist } from '../lib/wishlist.js'
import { useMountTransition } from '../lib/useMountTransition.js'
import { useDialogA11y } from '../lib/useDialogA11y.js'
import { useEdgeBack } from '../lib/useEdgeBack.js'
import { lockScroll } from '../lib/scrollLock.js'

const loadDiscoverAsk = () => import('./DiscoverAsk.jsx')
const DiscoverAsk = lazy(loadDiscoverAsk)

export function preloadGlobalAsk() {
  return Promise.all([
    loadDiscoverAsk(),
    import('./ChatMessage.jsx').then((module) => module.preloadMarkdown()),
  ])
}

const SCOPES = [
  { key: 'all', label: 'All' },
  { key: 'library', label: 'Library' },
  { key: 'catalog', label: 'Catalog' },
  { key: 'wishlist', label: 'Wishlist' },
]

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </svg>
  )
}

function AskIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l1.35 4.15L17.5 8.5l-4.15 1.35L12 14l-1.35-4.15L6.5 8.5l4.15-1.35L12 3Z" />
      <path d="M18.5 14l.75 2.25L21.5 17l-2.25.75L18.5 20l-.75-2.25L15.5 17l2.25-.75L18.5 14Z" />
    </svg>
  )
}

function resultGame(result) {
  if (result.kind === 'library') return result.item
  if (result.kind === 'wishlist') {
    return {
      id: result.item.igdb_id,
      name: result.item.title,
      cover: result.item.cover,
      year: result.item.year,
      released: result.item.released,
      release: result.item.release_label
        ? { label: result.item.release_label, precision: result.item.date_precision, ts: result.item.released }
        : null,
    }
  }
  return result.item
}

function SearchResult({ result, onSelect }) {
  const game = resultGame(result)
  const title = result.kind === 'library' ? game.title : game.name
  const cover = result.kind === 'library' ? libraryCover(game) : game.cover
  const platform = result.kind === 'library'
    ? platformMeta(game.environment).label
    : (game.platforms || []).slice(0, 2).join(' · ')
  const badge = result.kind === 'library' ? 'Owned' : result.kind === 'wishlist' ? 'Saved' : null
  return (
    <button type="button" className="global-search-result" onClick={() => onSelect(result)}>
      <Cover src={cover} title={title} size="sm" className="global-search-cover" />
      <span className="global-search-result-body">
        <strong>{title}</strong>
        <span>{[game.year, platform].filter(Boolean).join(' · ') || 'Game details'}</span>
        {badge ? <small className={`global-search-badge ${result.kind}`}>{badge}</small> : null}
      </span>
      <svg className="global-search-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
    </button>
  )
}

function SearchGroup({ label, results, onSelect }) {
  if (!results.length) return null
  return (
    <section className="global-search-group" aria-labelledby={`global-search-${label.toLowerCase()}`}>
      <h2 id={`global-search-${label.toLowerCase()}`}>{label}</h2>
      <div className="global-search-results">
        {results.map((result) => (
          <SearchResult key={`${result.kind}:${result.key}`} result={result} onSelect={onSelect} />
        ))}
      </div>
    </section>
  )
}

export default function GlobalSearch({
  open,
  defaultScope = 'all',
  defaultMode = 'search',
  seedPrompt,
  onClose,
  onScopeChange,
  onModeChange,
  onSeedConsumed,
}) {
  const { mounted, closing } = useMountTransition(open)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [scope, setScope] = useState(defaultScope)
  const [catalog, setCatalog] = useState([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [selected, setSelected] = useState(null)
  const [mode, setMode] = useState(defaultMode)
  const [askDraft, setAskDraft] = useState('')
  const [askSeed, setAskSeed] = useState(null)
  const requestRef = useRef(0)
  const wasOpenRef = useRef(false)
  const dialogRef = useDialogA11y({ active: mounted, onClose })
  const { games, loading: libraryLoading } = useLibraryGames()
  const { items: wishlist, loading: wishlistLoading } = useWishlist()

  useEdgeBack(onClose, { register: mounted, disabled: !mounted || Boolean(selected) })

  useEffect(() => {
    if (!mounted) return undefined
    return lockScroll()
  }, [mounted])

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setQuery('')
      setScope(defaultScope)
      setCatalog([])
      setCatalogError('')
      setSelected(null)
      setMode(defaultMode === 'ask' ? 'ask' : 'search')
      setAskDraft('')
      setAskSeed(null)
      if (defaultMode === 'ask') preloadGlobalAsk().catch(() => {})
    }
    wasOpenRef.current = open
  }, [open, defaultMode, defaultScope])

  useEffect(() => {
    if (onScopeChange) onScopeChange(scope)
  }, [scope, onScopeChange])

  const normalized = deferredQuery.trim()
  const wantsCatalog = scope === 'all' || scope === 'catalog'
  useEffect(() => {
    if (!open || mode !== 'search' || !wantsCatalog || normalized.length < 2) {
      requestRef.current += 1
      setCatalog([])
      setCatalogLoading(false)
      setCatalogError('')
      return undefined
    }
    const requestId = ++requestRef.current
    setCatalog([])
    setCatalogLoading(true)
    setCatalogError('')
    const timer = window.setTimeout(() => {
      fetchDiscover({ q: normalized, limit: 30 })
        .then((items) => {
          if (requestRef.current === requestId) setCatalog(items)
        })
        .catch(() => {
          if (requestRef.current === requestId) setCatalogError('Catalog search failed.')
        })
        .finally(() => {
          if (requestRef.current === requestId) setCatalogLoading(false)
        })
    }, 240)
    return () => window.clearTimeout(timer)
  }, [mode, open, wantsCatalog, normalized])

  function warmAsk() {
    preloadGlobalAsk().catch(() => {})
  }

  function showAsk() {
    warmAsk()
    setAskDraft(query.trim())
    setMode('ask')
    if (onModeChange) onModeChange('ask')
  }

  function showSearch() {
    setMode('search')
    if (onModeChange) onModeChange('search')
  }

  function askAboutGame(game) {
    const title = game?.name || game?.title
    if (!title) return
    warmAsk()
    setSelected(null)
    setAskSeed(`Would I like ${title}? Explain why it fits my taste and what I should know before playing.`)
    setMode('ask')
    if (onModeChange) onModeChange('ask')
  }

  function consumeAskSeed() {
    setAskSeed(null)
    if (onSeedConsumed) onSeedConsumed()
  }

  const libraryResults = useMemo(
    () => filterTitleMatches(games, deferredQuery, (game) => game.title, scope === 'all' ? 4 : 30)
      .map((item) => ({ kind: 'library', item, key: item.master_id })),
    [games, deferredQuery, scope],
  )
  const wishlistResults = useMemo(
    () => filterTitleMatches(wishlist, deferredQuery, (item) => item.title, scope === 'all' ? 4 : 30)
      .map((item) => ({ kind: 'wishlist', item, key: item.igdb_id })),
    [wishlist, deferredQuery, scope],
  )
  const catalogResults = useMemo(() => {
    const owned = new Set(games.map((game) => normTitle(game.title)))
    const saved = new Set(wishlist.map((item) => normTitle(item.title)))
    const list = scope === 'all'
      ? catalog.filter((game) => !owned.has(normTitle(game.name)) && !saved.has(normTitle(game.name))).slice(0, 8)
      : catalog
    return list.map((item) => ({ kind: 'catalog', item, key: item.id }))
  }, [catalog, games, wishlist, scope])

  if (!mounted) return null

  const showLibrary = scope === 'all' || scope === 'library'
  const showWishlist = scope === 'all' || scope === 'wishlist'
  const showCatalog = scope === 'all' || scope === 'catalog'
  const anyResults = (showLibrary && libraryResults.length) || (showWishlist && wishlistResults.length) || (showCatalog && catalogResults.length)
  const localLoading = (showLibrary && libraryLoading) || (showWishlist && wishlistLoading)
  const settled = !localLoading && (!showCatalog || !catalogLoading)

  return (
    <div ref={dialogRef} className={`global-search-page${closing ? ' closing' : ''}`} role="dialog" aria-modal="true" aria-label="Search and Ask GameDeck">
      <header className="global-search-header">
        <button type="button" className="global-search-back" aria-label={`Close ${mode === 'ask' ? 'Ask GameDeck' : 'search'}`} onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <h1>{mode === 'ask' ? 'Ask GameDeck' : 'Search GameDeck'}</h1>
      </header>

      <div className={`global-search-body${mode === 'ask' ? ' ask' : ''}`}>
        {mode === 'ask' ? (
          <>
            <div className="global-search-modebar" aria-label="Global search mode">
              <button type="button" onClick={showSearch}>
                <SearchIcon />
                Search games
              </button>
              <button type="button" className="active" aria-pressed={true}>
                <AskIcon />
                Ask
              </button>
            </div>
            <Suspense fallback={<div className="global-search-ask-loading" role="status">Starting Ask GameDeck…</div>}>
              <DiscoverAsk
                seedPrompt={askSeed || seedPrompt}
                initialInput={askDraft}
                onSeedConsumed={consumeAskSeed}
                onInitialInputConsumed={() => setAskDraft('')}
              />
            </Suspense>
          </>
        ) : (
          <>
            <div className="global-search-field">
              <label className="sr-only" htmlFor="gamedeck-search">Search games</label>
              <SearchIcon />
              <input
                id="gamedeck-search"
                type="search"
                name="gamedeck-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search games…"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="global-search-ask-toggle"
                aria-label="Ask GameDeck"
                onPointerDown={warmAsk}
                onFocus={warmAsk}
                onClick={showAsk}
              >
                <AskIcon />
                <span>Ask</span>
              </button>
            </div>

            <div className="global-search-scopes" aria-label="Search scope">
              {SCOPES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={scope === item.key ? 'active' : ''}
                  aria-pressed={scope === item.key}
                  onClick={() => setScope(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {!normalized ? (
              <MessageState title="Find any game in one place">Search your library, wishlist, and the complete catalog.</MessageState>
            ) : normalized.length < 2 && showCatalog ? (
              <MessageState title="Keep typing">Enter at least 2 characters to search the catalog.</MessageState>
            ) : (
              <div className="global-search-content" aria-busy={!settled}>
                {showLibrary ? <SearchGroup label="Library" results={libraryResults} onSelect={setSelected} /> : null}
                {showWishlist ? <SearchGroup label="Wishlist" results={wishlistResults} onSelect={setSelected} /> : null}
                {showCatalog ? <SearchGroup label="Catalog" results={catalogResults} onSelect={setSelected} /> : null}
                {!anyResults && !settled ? <LoadingState label="Searching GameDeck…" count={4} /> : null}
                {!anyResults && settled && catalogError ? (
                  <MessageState title="Couldn’t search the catalog" error>{catalogError} Try again in a moment.</MessageState>
                ) : null}
                {!anyResults && settled && !catalogError ? (
                  <MessageState title="No games found">Try another title or search scope.</MessageState>
                ) : null}
                {anyResults && catalogError ? <p className="global-search-partial" role="status">Catalog search is unavailable. Showing your saved games.</p> : null}
              </div>
            )}
          </>
        )}
      </div>

      {selected ? (
        <GameSheet
          variant={selected.kind === 'library' ? 'owned' : 'discover'}
          game={resultGame(selected)}
          inLibrary={selected.kind === 'library'}
          onClose={() => setSelected(null)}
          onAsk={selected.kind === 'library' ? undefined : askAboutGame}
        />
      ) : null}
    </div>
  )
}
