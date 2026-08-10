import { useEffect, useState } from 'react'
import Brand from './components/Brand.jsx'
import Menu from './components/Menu.jsx'
import SettingsPage from './components/SettingsPage.jsx'
import TabBar from './components/TabBar.jsx'
import LibraryTab from './components/LibraryTab.jsx'
import ActivityTab from './components/ActivityTab.jsx'
import InsightsTab from './components/InsightsTab.jsx'
import DiscoverTab from './components/DiscoverTab.jsx'
import WishlistTab from './components/WishlistTab.jsx'

const TABS = ['library', 'activity', 'insights', 'discover']

// Drawer edge-swipe: open with a swipe in from the left edge, close with a left swipe.
const EDGE_PX = 24
const OPEN_DX = 60
const CLOSE_DX = 60

export default function App() {
  const [activeTab, setActiveTab] = useState('library')
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // A drawer-opened overlay view (e.g. Wishlist) shown over the active tab.
  const [view, setView] = useState(null)
  // Header goes frosted + shows a separator once the page is scrolled off the top.
  const [scrolled, setScrolled] = useState(false)

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
      // Settings is a full-screen page over everything; its own swipe handles back.
      if (settingsOpen) return
      const t = e.touches && e.touches[0]
      if (!t) return
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      // Only act on a clearly horizontal gesture, so vertical scrolling is untouched.
      if (Math.abs(dx) <= Math.abs(dy)) return
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
  }, [menuOpen, settingsOpen])

  return (
    <div className="app">
      <header className={`app-header${scrolled ? ' scrolled' : ''}`}>
        <Brand onOpen={() => setMenuOpen(true)} />
        <button type="button" className="gear-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings" aria-haspopup="dialog">
          <span className="gear-chip">
            <svg className="gear-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </span>
        </button>
      </header>
      <main className="app-main">
        {view === 'wishlist' ? (
          <WishlistTab onClose={() => setView(null)} />
        ) : (
          <>
            {activeTab === 'library' && <LibraryTab />}
            {activeTab === 'activity' && <ActivityTab />}
            {activeTab === 'insights' && <InsightsTab />}
            {activeTab === 'discover' && <DiscoverTab />}
          </>
        )}
      </main>
      <TabBar
        active={view ? null : activeTab}
        onChange={(t) => {
          setView(null)
          setActiveTab(t)
        }}
        tabs={TABS}
      />
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} onOpenWishlist={() => setView('wishlist')} />
      <SettingsPage open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
