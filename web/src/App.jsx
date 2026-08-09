import { useEffect, useState } from 'react'
import Brand from './components/Brand.jsx'
import Menu from './components/Menu.jsx'
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
  // A drawer-opened overlay view (e.g. Wishlist) shown over the active tab.
  const [view, setView] = useState(null)

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
  }, [menuOpen])

  return (
    <div className="app">
      <header className="app-header">
        <Brand onOpen={() => setMenuOpen(true)} />
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
    </div>
  )
}
