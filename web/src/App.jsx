import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { lockScroll } from './lib/scrollLock.js'
import Brand from './components/Brand.jsx'
import Menu from './components/Menu.jsx'
import SettingsPage from './components/SettingsPage.jsx'
import TabBar from './components/TabBar.jsx'
import { useNewsUnread } from './lib/news.js'
import { useNavConfig, getNavConfig, visibleKeys, TAB_BY_KEY } from './lib/navConfig.js'
import { overlaysOpen } from './lib/useEdgeBack.js'
import { warmOnIdle } from './lib/warmChunks.js'
import CustomizeRows from './components/CustomizeRows.jsx'
import CustomizeNav from './components/CustomizeNav.jsx'
import CustomizeBar from './components/CustomizeBar.jsx'
import AuthGate from './components/AuthGate.jsx'
import { useAppSession } from './lib/appAuth.js'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'
import { buildAppLocation, defaultSearchScope, readAppLocation } from './lib/appLocation.js'

// Code-split each tab and the overlay views into their own chunk so the initial
// bundle only carries the shell + the first (Home, by default) tab. The service worker
// cache-firsts the hashed chunks, so after the first visit each one loads instantly.
//
// The tab loaders live in a map keyed by tab, and the lazy components are built
// FROM that map, because lib/warmChunks.js prefetches the ones you have not opened
// yet and it has to call the same specifier the renderer will. A prefetch written
// against a second copy of `import('./components/NewsTab.jsx')` warms a chunk the
// renderer then does not use, and nothing about the result would say so.
const TAB_LOADERS = {
  home: () => import('./components/HomeTab.jsx'),
  library: () => import('./components/LibraryTab.jsx'),
  activity: () => import('./components/ActivityTab.jsx'),
  insights: () => import('./components/InsightsTab.jsx'),
  discover: () => import('./components/DiscoverTab.jsx'),
  news: () => import('./components/NewsTab.jsx'),
  wishlist: () => import('./components/WishlistTab.jsx'),
  rankings: () => import('./components/RankingsTab.jsx'),
}

const HomeTab = lazy(TAB_LOADERS.home)
const LibraryTab = lazy(TAB_LOADERS.library)
const ActivityTab = lazy(TAB_LOADERS.activity)
const InsightsTab = lazy(TAB_LOADERS.insights)
const DiscoverTab = lazy(TAB_LOADERS.discover)
const NewsTab = lazy(TAB_LOADERS.news)
const WishlistTab = lazy(TAB_LOADERS.wishlist)
const RankingsTab = lazy(TAB_LOADERS.rankings)
const VIEW_LOADERS = {
  list: () => import('./components/ListView.jsx'),
  wishlist: TAB_LOADERS.wishlist,
  shuffle: () => import('./components/ShufflePicker.jsx'),
}
const ListView = lazy(VIEW_LOADERS.list)
const ShufflePicker = lazy(VIEW_LOADERS.shuffle)
const loadGlobalSearch = () => import('./components/GlobalSearch.jsx')
const GlobalSearch = lazy(loadGlobalSearch)
const VALID_TABS = new Set(Object.keys(TAB_BY_KEY))

function ChunkFallback({ label = 'Opening…', overlay = false }) {
  return (
    <div className={`chunk-fallback${overlay ? ' overlay' : ''}`} role="status" aria-live="polite">
      <span className="chunk-fallback-line skeleton" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

const warmLoader = (loader) => {
  if (!loader) return
  Promise.resolve().then(loader).catch(() => {})
}

// Drawer edge-swipe: open with a swipe in from the left edge, close with a left swipe.
const EDGE_PX = 24
const OPEN_DX = 60
const CLOSE_DX = 60
// Keep a drawer-opened view mounted through its slide-out (matches --overlay-out).
const VIEW_EXIT_MS = 220

export default function App() {
  const { loading, session, recovery, finishRecovery } = useAppSession()
  if (loading) return <div className="auth-loading" role="status">Opening GameDeck…</div>
  if (recovery) return <AuthGate recovery onRecoveryComplete={finishRecovery} />
  if (!session) return <AuthGate />
  return <AppErrorBoundary><GameDeckApp /></AppErrorBoundary>
}

function GameDeckApp() {
  const initialShell = useRef(null)
  if (!initialShell.current) {
    const fallback = visibleKeys(getNavConfig())[0] || 'home'
    initialShell.current = readAppLocation(window.location.href, VALID_TABS, fallback)
  }
  // Open on whatever tab is leftmost in the saved layout (not always Library), so
  // reordering the tab bar also changes the landing tab.
  const [activeTab, setActiveTab] = useState(() => initialShell.current.tab)
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [customizeNavOpen, setCustomizeNavOpen] = useState(false)
  const [customizeBarOpen, setCustomizeBarOpen] = useState(false)
  const [shuffleOpen, setShuffleOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(() => initialShell.current.searchOpen)
  const [searchVisited, setSearchVisited] = useState(() => initialShell.current.searchOpen)
  const [searchMode, setSearchMode] = useState(() => initialShell.current.searchMode || 'search')
  const [searchSeed, setSearchSeed] = useState(null)
  const [searchScope, setSearchScope] = useState(
    () => initialShell.current.searchScope || defaultSearchScope({ activeTab: initialShell.current.tab, view: initialShell.current.view }),
  )
  // Live tab bar layout (order + which tabs show + label visibility).
  const nav = useNavConfig()
  const visibleTabs = visibleKeys(nav)
  // A drawer-opened overlay view (Wishlist / status lists) shown over the active tab.
  const [view, setView] = useState(() => initialShell.current.view)
  const [viewClosing, setViewClosing] = useState(false)
  const viewTimer = useRef(null)
  // Header goes frosted + shows a separator once the page is scrolled off the top.
  const [scrolled, setScrolled] = useState(false)
  // Unread dot on the News tab when a newer weekly drop is available.
  const newsUnread = useNewsUnread()
  // Blank while a drawer-opened overlay is up: Wishlist and the status lists
  // print their own heading, and two would disagree about where you are.
  const headerTitle = view ? '' : TAB_BY_KEY[activeTab]?.label || ''

  const writeLocation = useCallback((next, replace = false) => {
    const href = buildAppLocation(window.location.href, next)
    window.history[replace ? 'replaceState' : 'pushState'](
      {
        ...(window.history.state || {}),
        gamedeckShell: true,
        gamedeckSearch: Boolean(next.searchOpen),
        gamedeckMenu: false,
      },
      '',
      href,
    )
  }, [])

  // The drawer is an action available from every root tab, not another place in
  // browser history. Root edge-swipes open it; only nested pages own Back.
  const openMenu = useCallback(() => {
    setMenuOpen(true)
  }, [])

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
  }, [])

  // Bottom-bar and drawer tabs are peers. Switching between them replaces the
  // current root destination so browser Back never walks across the tab bar.
  const navigateTab = useCallback((tab, { replace = true } = {}) => {
    if (!VALID_TABS.has(tab)) return
    if (viewTimer.current) {
      clearTimeout(viewTimer.current)
      viewTimer.current = null
    }
    setView(null)
    setViewClosing(false)
    setSearchOpen(false)
    setSearchMode('search')
    setSearchSeed(null)
    setActiveTab(tab)
    writeLocation({ tab, view: null, searchOpen: false, searchScope: null, searchMode: null }, replace)
  }, [writeLocation])

  const openSearch = useCallback(() => {
    const scope = defaultSearchScope({ activeTab, view })
    loadGlobalSearch()
    setSearchVisited(true)
    setSearchScope(scope)
    setSearchMode('search')
    setSearchSeed(null)
    setSearchOpen(true)
    writeLocation({ tab: activeTab, view, searchOpen: true, searchScope: scope, searchMode: 'search' })
  }, [activeTab, view, writeLocation])

  const openAsk = useCallback((game = null) => {
    const scope = defaultSearchScope({ activeTab, view })
    const prompt = game
      ? `Would I like ${game.name || game.title}? Explain why it fits my taste and what I should know before playing.`
      : null
    loadGlobalSearch()
      .then((module) => module.preloadGlobalAsk?.())
      .catch(() => {})
    setSearchVisited(true)
    setSearchScope(scope)
    setSearchMode('ask')
    setSearchSeed(prompt)
    setSearchOpen(true)
    writeLocation({ tab: activeTab, view, searchOpen: true, searchScope: scope, searchMode: 'ask' })
  }, [activeTab, view, writeLocation])

  const closeSearch = useCallback(() => {
    const current = new URL(window.location.href)
    if (current.searchParams.get('search') === '1' && window.history.state?.gamedeckSearch) {
      window.history.back()
      return
    }
    setSearchOpen(false)
    setSearchMode('search')
    setSearchSeed(null)
    writeLocation({ tab: activeTab, view, searchOpen: false, searchScope: null, searchMode: null }, true)
  }, [activeTab, view, writeLocation])

  const changeSearchScope = useCallback((scope) => {
    setSearchScope(scope)
    if (searchOpen) writeLocation({ tab: activeTab, view, searchOpen: true, searchScope: scope, searchMode }, true)
  }, [activeTab, view, searchMode, searchOpen, writeLocation])

  const changeSearchMode = useCallback((mode) => {
    const nextMode = mode === 'ask' ? 'ask' : 'search'
    setSearchMode(nextMode)
    if (nextMode === 'search') setSearchSeed(null)
    if (searchOpen) writeLocation({ tab: activeTab, view, searchOpen: true, searchScope, searchMode: nextMode }, true)
  }, [activeTab, view, searchOpen, searchScope, writeLocation])

  const openView = (v) => {
    if (viewTimer.current) {
      clearTimeout(viewTimer.current)
      viewTimer.current = null
    }
    setViewClosing(false)
    setView(v)
    setSearchOpen(false)
    setSearchMode('search')
    setSearchSeed(null)
    writeLocation({ tab: activeTab, view: v, searchOpen: false, searchScope: null, searchMode: null })
  }
  // Animate the view out (slide + fade, like the drawer), then unmount it.
  const closeView = () => {
    if (!view || viewClosing) return
    setViewClosing(true)
    viewTimer.current = setTimeout(() => {
      setView(null)
      setViewClosing(false)
      viewTimer.current = null
      writeLocation({ tab: activeTab, view: null, searchOpen: false, searchScope: null }, true)
    }, VIEW_EXIT_MS)
  }
  useEffect(() => () => viewTimer.current && clearTimeout(viewTimer.current), [])

  // Lock background scroll while a view overlay is open (shared ref-counted lock).
  useEffect(() => {
    if (!view) return undefined
    return lockScroll()
  }, [view])

  // When the visible set changes (the user edits Navigation) and that change
  // hides the tab they're currently on, snap to the first visible tab so the bar
  // isn't left highlighting nothing. Opening a hidden tab from the drawer's
  // "More" list doesn't change the visible set, so it isn't snapped away.
  const visibleKey = visibleTabs.join('|')
  const prevVisibleKey = useRef(visibleKey)
  useEffect(() => {
    const changed = prevVisibleKey.current !== visibleKey
    prevVisibleKey.current = visibleKey
    if (!changed || view) return
    if (!visibleTabs.includes(activeTab)) navigateTab(visibleTabs[0], { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey])

  useEffect(() => {
    // Put the initial destination in the address bar without adding a history
    // entry. Root tabs replace one another; nested list/Search pages may add an
    // entry and are the only destinations that own Back.
    writeLocation({
      tab: activeTab,
      view,
      searchOpen,
      searchScope: searchOpen ? searchScope : null,
      searchMode: searchOpen ? searchMode : null,
    }, true)
    const onPopState = () => {
      const fallback = visibleKeys(getNavConfig())[0] || 'home'
      const next = readAppLocation(window.location.href, VALID_TABS, fallback)
      setMenuOpen(false)
      setActiveTab(next.tab)
      setView(next.view)
      setViewClosing(false)
      setSearchOpen(next.searchOpen)
      if (next.searchOpen) setSearchVisited(true)
      setSearchScope(next.searchScope || defaultSearchScope({ activeTab: next.tab, view: next.view }))
      setSearchMode(next.searchMode || 'search')
      setSearchSeed(null)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
    // Shell location is initialised once; subsequent writes are owned by the
    // explicit navigation handlers above, not by render state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // A little hysteresis keeps iOS rubber-band/one-pixel scroll noise from
    // flashing the glass state while the page is visually still at rest.
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Opening the drawer is intent: the next tap is likely to be Wishlist, a
  // status list or Shuffle. Warm those small chunks during the drawer animation
  // so their first open does not wait on a request. These are not launch work and
  // hidden tabs remain excluded from the ordinary idle queue.
  useEffect(() => {
    if (!menuOpen) return
    warmLoader(VIEW_LOADERS.wishlist)
    warmLoader(VIEW_LOADERS.list)
    warmLoader(VIEW_LOADERS.shuffle)
  }, [menuOpen])

  // Fetch the code for the OTHER tabs in the bar once the page has loaded, one at
  // a time on idle. Run once on mount and never re-run: the point is to spend the
  // quiet minute after launch, and a dependency on the tab or the nav config would
  // restart the queue every time either moved.
  //
  // The order is the bar's own order, minus the tab already on screen (its chunk
  // is being fetched by the renderer, and asking twice is one wasted request).
  // Tabs hidden from the bar are not warmed - a tab the user deliberately removed
  // is the last one worth spending bandwidth on.
  useEffect(() => {
    const first = visibleKeys(getNavConfig())[0] || 'home'
    const order = visibleKeys(getNavConfig()).filter((k) => k !== first && TAB_LOADERS[k])
    return warmOnIdle(order.map((k) => TAB_LOADERS[k]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let startX = 0
    let startY = 0
    let tracking = false
    let fromEdge = false

    const onStart = (e) => {
      const t = e.touches && e.touches[0]
      if (!t) return
      startX = t.clientX
      startY = t.clientY
      fromEdge = startX <= EDGE_PX
      tracking = true
    }
    const onMove = (e) => {
      if (!tracking) return
      // Full-screen pages with their own edge-back swipe (Settings / Customize,
      // and any overlay registered via useEdgeBack, e.g. the Discover rail page):
      // don't also open the app drawer behind them on an edge swipe.
      if (settingsOpen || customizeOpen || customizeNavOpen || customizeBarOpen || shuffleOpen || overlaysOpen()) return
      const t = e.touches && e.touches[0]
      if (!t) return
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      // Only act on a clearly horizontal gesture, so vertical scrolling is untouched.
      if (Math.abs(dx) <= Math.abs(dy)) return
      // Claim the gesture before the action threshold. Without this, iOS can
      // perform its native history swipe while GameDeck opens the drawer or
      // closes a nested view, producing two actions from one finger movement.
      if (((fromEdge && dx > 0) || (menuOpen && dx < 0)) && e.cancelable) e.preventDefault()
      // A drawer-opened overlay (Wishlist, status/smart lists) is open: an edge
      // swipe-in goes back to close it instead of opening the app drawer.
      if (view) {
        if (!viewClosing && fromEdge && dx > OPEN_DX) {
          closeView()
          tracking = false
        }
        return
      }
      if (!menuOpen && fromEdge && dx > OPEN_DX) {
        openMenu()
        tracking = false
      } else if (menuOpen && dx < -CLOSE_DX) {
        closeMenu()
        tracking = false
      }
    }
    const onEnd = () => {
      tracking = false
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [closeMenu, menuOpen, openMenu, settingsOpen, customizeOpen, customizeNavOpen, customizeBarOpen, shuffleOpen, view, viewClosing])

  return (
    // `bar-off` collapses --tabbar-height to zero for everything inside, which
    // is how .app-main's bottom padding and the Discover chat page's height
    // calc reclaim the space without either of them learning about the setting.
    <div className={`app${nav.barShown ? '' : ' bar-off'}`}>
      {/* ONE ROW, not two. The bar and the large title were a 44px lockup saying
          the app's name inside the app, above a 48px title saying what the
          highlighted tab already says - 92px before the subtitle had even
          started. They are the same row now: the mark, the tab name at its full
          34px, and the caret, in a 56px bar that shrinks the name to 17px on
          scroll. Nothing got smaller at rest; a row went away.

          There is one <h1> and one copy of the title. The stand-in that used to
          fade in when the large title scrolled off is gone with the second row,
          because the title it stood in for never leaves now. */}
      <header className={`app-header${scrolled ? ' scrolled' : ''}`}>
        {headerTitle ? (
          <h1 className="page-title">
            <Brand onOpen={openMenu} label={headerTitle} />
          </h1>
        ) : (
          <Brand onOpen={openMenu} />
        )}
      </header>
      <main className="app-main">
        <Suspense fallback={<ChunkFallback label={`Opening ${headerTitle || 'GameDeck'}…`} />}>
          {activeTab === 'home' && (
            <HomeTab
              onOpenTab={(t) => {
                closeView()
                navigateTab(t)
              }}
              onOpenList={openView}
            />
          )}
          {activeTab === 'library' && <LibraryTab />}
          {activeTab === 'activity' && <ActivityTab />}
          {activeTab === 'insights' && <InsightsTab />}
          {activeTab === 'discover' && <DiscoverTab onCustomize={() => setCustomizeOpen(true)} onAsk={openAsk} />}
          {activeTab === 'news' && <NewsTab />}
          {activeTab === 'rankings' && <RankingsTab />}
        </Suspense>
      </main>
      {view ? (
        <div className={`view-page${viewClosing ? ' closing' : ''}`}>
          <Suspense fallback={<ChunkFallback label="Opening list…" overlay />}>
            {/* Wishlist and Release watch share the same cached rows, list,
                sorting, density and sheet. Release watch adds a three-way scope
                control and opens on Upcoming; the drawer Wishlist stays on All. */}
            {view === 'wishlist' || view === 'releases' || view === 'released' ? (
              <WishlistTab
                onClose={closeView}
                mode={view === 'wishlist' ? 'wishlist' : 'releases'}
                initialScope={view === 'released' ? 'out' : view === 'releases' ? 'upcoming' : 'all'}
              />
            ) : (
              <ListView viewKey={view} onClose={closeView} />
            )}
          </Suspense>
        </div>
      ) : null}
      {/* Unmounted rather than hidden when the bar is off: a display:none bar
          still answers to the a11y tree in some readers, and there is nothing
          here worth keeping mounted. The drawer holds every destination it
          carried, so nothing becomes unreachable. */}
      {nav.barShown ? (
        <TabBar
          active={view ? null : activeTab}
          onChange={(t) => {
            closeView()
            navigateTab(t)
          }}
          onSearch={openSearch}
          onWarm={(t) => warmLoader(TAB_LOADERS[t])}
          tabs={visibleTabs}
          showLabels={nav.labels}
          badges={{ news: newsUnread }}
        />
      ) : null}
      <Menu
        open={menuOpen}
        onClose={closeMenu}
        activeTab={view ? null : activeTab}
        onOpenWishlist={() => openView('wishlist')}
        onOpenList={(key) => openView(key)}
        onOpenSettings={() => setSettingsOpen(true)}
        onShuffle={() => setShuffleOpen(true)}
        onSearch={openSearch}
        searchPinned={!nav.barShown}
        onOpenTab={(t) => {
          closeView()
          navigateTab(t)
        }}
        onWarmTab={(t) => warmLoader(TAB_LOADERS[t])}
      />
      <Suspense fallback={<ChunkFallback label="Opening Shuffle…" overlay />}>
        {shuffleOpen ? <ShufflePicker open onClose={() => setShuffleOpen(false)} /> : null}
      </Suspense>
      <SettingsPage
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpenBar={() => setCustomizeBarOpen(true)}
        onOpenDrawer={() => setCustomizeNavOpen(true)}
      />
      <CustomizeRows open={customizeOpen} onClose={() => setCustomizeOpen(false)} />
      <CustomizeNav open={customizeNavOpen} onClose={() => setCustomizeNavOpen(false)} />
      <CustomizeBar open={customizeBarOpen} onClose={() => setCustomizeBarOpen(false)} />
      {searchVisited ? (
        <Suspense fallback={searchOpen ? <ChunkFallback label="Opening Search…" overlay /> : null}>
          <GlobalSearch
            open={searchOpen}
            defaultScope={searchScope}
            defaultMode={searchMode}
            seedPrompt={searchSeed}
            onClose={closeSearch}
            onScopeChange={changeSearchScope}
            onModeChange={changeSearchMode}
            onSeedConsumed={() => setSearchSeed(null)}
          />
        </Suspense>
      ) : null}
    </div>
  )
}
