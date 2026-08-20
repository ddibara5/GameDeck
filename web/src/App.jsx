import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { lockScroll } from './lib/scrollLock.js'
import Brand from './components/Brand.jsx'
import Menu from './components/Menu.jsx'
import SettingsPage from './components/SettingsPage.jsx'
import TabBar from './components/TabBar.jsx'
import { useNewsUnread } from './lib/news.js'
import { useNavConfig, getNavConfig, visibleKeys, TAB_BY_KEY } from './lib/navConfig.js'
import { overlaysOpen } from './lib/useEdgeBack.js'
import CustomizeRows from './components/CustomizeRows.jsx'
import CustomizeNav from './components/CustomizeNav.jsx'
import CustomizeBar from './components/CustomizeBar.jsx'

// Code-split each tab and the overlay views into their own chunk so the initial
// bundle only carries the shell + the first (Library) tab. The service worker
// cache-firsts the hashed chunks, so after the first visit each one loads instantly.
const HomeTab = lazy(() => import('./components/HomeTab.jsx'))
const LibraryTab = lazy(() => import('./components/LibraryTab.jsx'))
const ActivityTab = lazy(() => import('./components/ActivityTab.jsx'))
const InsightsTab = lazy(() => import('./components/InsightsTab.jsx'))
const DiscoverTab = lazy(() => import('./components/DiscoverTab.jsx'))
const NewsTab = lazy(() => import('./components/NewsTab.jsx'))
const WishlistTab = lazy(() => import('./components/WishlistTab.jsx'))
const ListView = lazy(() => import('./components/ListView.jsx'))
const ShufflePicker = lazy(() => import('./components/ShufflePicker.jsx'))

// Drawer edge-swipe: open with a swipe in from the left edge, close with a left swipe.
const EDGE_PX = 24
const OPEN_DX = 60
const CLOSE_DX = 60
// Keep a drawer-opened view mounted through its slide-out (matches --overlay-out).
const VIEW_EXIT_MS = 220

export default function App() {
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
    <div className="app">
      <header className={`app-header${scrolled ? ' scrolled' : ''}`}>
        <Brand onOpen={() => setMenuOpen(true)} />
        {/* Each tab prints its own 34px large title, which scrolls away. This is
            the inline stand-in that fades in to replace it, so the header always
            answers "where am I?" without costing the screen a permanent 34px.
            Hidden from the a11y tree while invisible: the tab's own <h1> is the
            real heading, and two live copies would be read out twice. */}
        <span className="app-header-title" aria-hidden={!scrolled}>
          {view ? '' : TAB_BY_KEY[activeTab]?.label || ''}
        </span>
        <div className="header-actions">
          <button type="button" className="dice-btn" onClick={() => setShuffleOpen(true)} aria-label="Shuffle a game" aria-haspopup="dialog">
            <span className="gear-chip">
              <svg className="dice-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="4" />
                <circle cx="8.4" cy="7.6" r="1.05" fill="currentColor" stroke="none" />
                <circle cx="8.4" cy="12" r="1.05" fill="currentColor" stroke="none" />
                <circle cx="8.4" cy="16.4" r="1.05" fill="currentColor" stroke="none" />
                <circle cx="15.6" cy="7.6" r="1.05" fill="currentColor" stroke="none" />
                <circle cx="15.6" cy="12" r="1.05" fill="currentColor" stroke="none" />
                <circle cx="15.6" cy="16.4" r="1.05" fill="currentColor" stroke="none" />
              </svg>
            </span>
          </button>
          <button type="button" className="gear-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings" aria-haspopup="dialog">
            <span className="gear-chip">
              <svg className="gear-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </span>
          </button>
        </div>
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
        </Suspense>
      </main>
      {view ? (
        <div className={`view-page${viewClosing ? ' closing' : ''}`}>
          <Suspense fallback={null}>
            {view === 'wishlist' ? (
              <WishlistTab onClose={closeView} />
            ) : (
              <ListView viewKey={view} onClose={closeView} />
            )}
          </Suspense>
        </div>
      ) : null}
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
      <Menu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        activeTab={view ? null : activeTab}
        onOpenWishlist={() => openView('wishlist')}
        onOpenList={(key) => openView(key)}
        onOpenSettings={() => setSettingsOpen(true)}
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
