import { lazy, Suspense, useRef, useState } from 'react'
import DiscoverForYou from './DiscoverForYou.jsx'
import { preloadMarkdown } from './ChatMessage.jsx'
import { useDialogA11y } from '../lib/useDialogA11y.js'
import './discover.css'

const loadDiscoverBrowse = () => import('./DiscoverBrowse.jsx')
const loadDiscoverAsk = () => import('./DiscoverAsk.jsx')
const DiscoverBrowse = lazy(loadDiscoverBrowse)
const DiscoverAsk = lazy(loadDiscoverAsk)

export default function DiscoverTab({ onCustomize }) {
  const [mode, setMode] = useState('foryou')
  const [browseVisited, setBrowseVisited] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const [seedPrompt, setSeedPrompt] = useState(null)
  const forYouTabRef = useRef(null)
  const browseTabRef = useRef(null)
  const askDialogRef = useDialogA11y({ active: askOpen, onClose: () => setAskOpen(false) })

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

  function warmAsk() {
    loadDiscoverAsk()
    preloadMarkdown()
  }

  function openAsk() {
    warmAsk()
    setSeedPrompt(null)
    setAskOpen(true)
  }

  function askAbout(game) {
    warmAsk()
    setSeedPrompt(`Would I like ${game.name || game.title}? Explain why it fits my taste and what I should know before playing.`)
    setAskOpen(true)
  }

  return (
    <div className="discover-page">
      <div className="discover-base" hidden={askOpen}>
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
          <DiscoverForYou onAsk={askAbout} onOpenAsk={openAsk} />
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

      {askOpen ? (
        <div ref={askDialogRef} className="discover-ask-view" role="dialog" aria-modal="true" aria-label="Ask GameDeck">
          <div className="discover-ask-header">
            <button type="button" className="discover-ask-back" aria-label="Back to Discover" onClick={() => setAskOpen(false)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <div className="discover-ask-titles">
              <strong>Ask GameDeck</strong>
              <span>Personalized to your library and ranking</span>
            </div>
          </div>
          <Suspense fallback={<div className="discover-ask-loading" role="status">Starting Ask AI…</div>}>
            <DiscoverAsk seedPrompt={seedPrompt} onSeedConsumed={() => setSeedPrompt(null)} />
          </Suspense>
        </div>
      ) : null}
    </div>
  )
}
