import { lazy, Suspense, useRef, useState } from 'react'
import DiscoverForYou from './DiscoverForYou.jsx'
import './discover.css'

const loadDiscoverBrowse = () => import('./DiscoverBrowse.jsx')
const DiscoverBrowse = lazy(loadDiscoverBrowse)

export default function DiscoverTab({ onCustomize, onAsk }) {
  const [mode, setMode] = useState('foryou')
  const [browseVisited, setBrowseVisited] = useState(false)
  const forYouTabRef = useRef(null)
  const browseTabRef = useRef(null)

  function selectMode(nextMode) {
    if (nextMode === 'browse') setBrowseVisited(true)
    setMode(nextMode)
  }

  function warmBrowse() {
    loadDiscoverBrowse()
  }

  function handleModeKeys(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextMode = event.key === 'ArrowRight' || event.key === 'End' ? 'browse' : 'foryou'
    selectMode(nextMode)
    const nextRef = nextMode === 'browse' ? browseTabRef : forYouTabRef
    requestAnimationFrame(() => nextRef.current?.focus())
  }

  function askAbout(game) {
    if (onAsk) onAsk(game)
  }

  return (
    <div className="discover-page">
      <div className="discover-base">
        <div className="discover-mode-bar">
          <div className="seg discover-mode-seg" role="tablist" aria-label="Discover view" onKeyDown={handleModeKeys}>
            <button
              id="discover-foryou-tab"
              ref={forYouTabRef}
              type="button"
              className={`seg-btn${mode === 'foryou' ? ' active' : ''}`}
              role="tab"
              aria-selected={mode === 'foryou'}
              aria-controls="discover-foryou-panel"
              tabIndex={mode === 'foryou' ? 0 : -1}
              onClick={() => selectMode('foryou')}
            >
              For You
            </button>
            <button
              id="discover-browse-tab"
              ref={browseTabRef}
              type="button"
              className={`seg-btn${mode === 'browse' ? ' active' : ''}`}
              role="tab"
              aria-selected={mode === 'browse'}
              aria-controls="discover-browse-panel"
              tabIndex={mode === 'browse' ? 0 : -1}
              onPointerDown={warmBrowse}
              onFocus={warmBrowse}
              onClick={() => selectMode('browse')}
            >
              Browse
            </button>
          </div>
        </div>

        <div id="discover-foryou-panel" role="tabpanel" aria-labelledby="discover-foryou-tab" hidden={mode !== 'foryou'}>
          <DiscoverForYou
            onAsk={askAbout}
            onBrowse={() => {
              warmBrowse()
              selectMode('browse')
            }}
          />
        </div>

        {browseVisited ? (
          <div id="discover-browse-panel" role="tabpanel" aria-labelledby="discover-browse-tab" hidden={mode !== 'browse'}>
            <Suspense fallback={<div className="discover-view-loading" role="status">Loading Browse…</div>}>
              <DiscoverBrowse
                onAsk={askAbout}
                onCustomize={onCustomize}
              />
            </Suspense>
          </div>
        ) : null}
      </div>

    </div>
  )
}
