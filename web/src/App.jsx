import { lazy, Suspense, useEffect, useRef, useState } from 'react'
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

// Code-split each tab and the overlay views into their own chunk so the initial
// bundle only carries the shell + the first (Library) tab. The service worker
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
const ListView = lazy(() => import('./components/ListView.jsx'))
const ShufflePicker = lazy(() => import('./components/ShufflePicker.jsx'))

// Drawer edge-swipe: open with a swipe in from the left edge, close with a left swipe.
const EDGE_PX = 24
const OPEN_DX = 60
const CLOSE_DX = 60
// Keep a drawer-opened view mounted through its slide-out (matches --overlay-out).
const VIEW_EXIT_MS = 220

export default function App() {
  const { loading, session } = useAppSession()
  if (loading) return <div className="auth-loading" role="status">Opening GameDeck…</div>
  if (!session) return <AuthGate />
  return <AppErrorBoundary><GameDeckApp /></AppErrorBoundary>
}

function GameDeckApp() {
  // Open on whatever tab is leftmost in the saved layout (not always Library), so
  // reordering the tab bar also changes the landing tab.
  const [activeTab, setActiveTab] = useState(() => visibleKeys(getNavConfig())[0] || 'library')
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [customizeNavOpen, setCustomizeNavOpen] = useState(false)
  const [customizeBarOpen, setCustomizeBarOpen] = useState(false)
  const [shuffleOpen, setShuffleOpen] = useState(false)
  // Live tab bar layout (order + which tabs show + label visibility).
  const nav = useNavConfig()
  const visibleTabs = visibleKeys(nav)
  // A drawer-opened overlay view (Wishlist / status lists) shown over the active tab.
  const [view, setView] = useState(null)
  const [viewClosing, setViewClosing] = useState(false)
  const viewTimer = useRef(null)
  // Header goes frosted + shows a separator once the page is scrolled off the top.
  const [scrolled, setScrolled] = useState(false)
  // Unread dot on the News tab when a newer weekly drop is available.
  const newsUnread = useNewsUnread()
  // Blank while a drawer-opened overlay is up: Wishlist and the status lists
  // print their own heading, and two would disagree about where you are.
  const headerTitle = view ? '' : TAB_BY_KEY[activeTab]?.label || ''

  const openView = (v) => {
    if (viewTimer.current) {
      clearTimeout(viewTimer.current)
      viewTimer.current = null
    }
    setViewClosing(false)
    setView(v)
  }
  // Animate the view out (slide + fade, like the drawer), then unmount it.
  const closeView = () => {
    if (!view || viewClosing) return
    setViewClosing(true)
    viewTimer.current = setTimeout(() => {
      setView(null)
      setViewClosing(false)
      viewTimer.current = null
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
    if (!visibleTabs.includes(activeTab)) setActiveTab(visibleTabs[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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
    const first = visibleKeys(getNavConfig())[0] || 'library'
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
        setMenuOpen(true)
        tracking = false
      } else if (menuOpen && dx < -CLOSE_DX) {
        setMenuOpen(false)
        tracking = false
      }
    }
    const onEnd = () => {
      tracking = false
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [menuOpen, settingsOpen, customizeOpen, customizeNavOpen, customizeBarOpen, shuffleOpen, view, viewClosing])

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
            <Brand onOpen={() => setMenuOpen(true)} label={headerTitle} />
          </h1>
        ) : (
          <Brand onOpen={() => setMenuOpen(true)} />
        )}
      </header>
      <main className="app-main">
        <Suspense fallback={null}>
          {activeTab === 'home' && (
            <HomeTab
              onOpenTab={(t) => {
                closeView()
                setActiveTab(t)
              }}
              onOpenList={openView}
            />
          )}
          {activeTab === 'library' && <LibraryTab />}
          {activeTab === 'activity' && <ActivityTab />}
          {activeTab === 'insights' && <InsightsTab />}
          {activeTab === 'discover' && <DiscoverTab onCustomize={() => setCustomizeOpen(true)} />}
          {activeTab === 'news' && <NewsTab />}
          {activeTab === 'rankings' && <RankingsTab />}
        </Suspense>
      </main>
      {view ? (
        <div className={`view-page${viewClosing ? ' closing' : ''}`}>
          <Suspense fallback={null}>
            {/* Two views, one component. 'released' is the wishlist filtered to
                what has already come out, which is where Recently released
                points; see the scope note in WishlistTab. */}
            {view === 'wishlist' || view === 'released' ? (
              <WishlistTab onClose={closeView} scope={view === 'released' ? 'out' : 'all'} />
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
            setActiveTab(t)
          }}
          tabs={visibleTabs}
          showLabels={nav.labels}
          badges={{ news: newsUnread }}
        />
      ) : null}
      <Menu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        activeTab={view ? null : activeTab}
        onOpenWishlist={() => openView('wishlist')}
        onOpenList={(key) => openView(key)}
        onOpenSettings={() => setSettingsOpen(true)}
        onShuffle={() => setShuffleOpen(true)}
        onCustomize={() => setCustomizeNavOpen(true)}
        onOpenTab={(t) => {
          closeView()
          setActiveTab(t)
        }}
      />
      <Suspense fallback={null}>
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
    </div>
  )
}
