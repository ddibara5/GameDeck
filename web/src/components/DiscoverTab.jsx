import { lazy, Suspense, useState } from 'react'
import DiscoverForYou from './DiscoverForYou.jsx'
import { preloadMarkdown } from './ChatMessage.jsx'
import './discover.css'

const MODE_KEY = 'gamedeck_discover_mode_v1'

const loadDiscoverBrowse = () => import('./DiscoverBrowse.jsx')
const loadDiscoverAsk = () => import('./DiscoverAsk.jsx')
const DiscoverBrowse = lazy(loadDiscoverBrowse)
const DiscoverAsk = lazy(loadDiscoverAsk)

function initialMode() {
  try {
    return sessionStorage.getItem(MODE_KEY) === 'browse' ? 'browse' : 'foryou'
  } catch {
    return 'foryou'
  }
}

export default function DiscoverTab({ onCustomize }) {
  const [mode, setMode] = useState(initialMode)
  const [visited, setVisited] = useState(() => new Set([mode]))
  const [askOpen, setAskOpen] = useState(false)
  const [seedPrompt, setSeedPrompt] = useState(null)
  const [filterToken, setFilterToken] = useState(0)

  function selectMode(next) {
    if (next === 'browse') loadDiscoverBrowse()
    setMode(next)
    setVisited((current) => {
      if (current.has(next)) return current
      const updated = new Set(current)
      updated.add(next)
      return updated
    })
    try {
      sessionStorage.setItem(MODE_KEY, next)
    } catch {
      // Storage can be unavailable in private or embedded browsing contexts.
    }
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

  function tuneForYou() {
    selectMode('browse')
    setFilterToken((value) => value + 1)
  }

  function handleTabKey(event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const next = mode === 'foryou' ? 'browse' : 'foryou'
    selectMode(next)
    document.getElementById(`discover-tab-${next}`)?.focus()
  }

  return (
    <div className="discover-page">
      <div className="discover-base" hidden={askOpen}>
        <div className="discover-topbar">
          <div className="seg discover-seg" role="tablist" aria-label="Discover views" onKeyDown={handleTabKey}>
            <button
              id="discover-tab-foryou"
              type="button"
              role="tab"
              aria-selected={mode === 'foryou'}
              aria-controls="discover-panel-foryou"
              tabIndex={mode === 'foryou' ? 0 : -1}
              className={`seg-btn${mode === 'foryou' ? ' active' : ''}`}
              onClick={() => selectMode('foryou')}
            >
              For You
            </button>
            <button
              id="discover-tab-browse"
              type="button"
              role="tab"
              aria-selected={mode === 'browse'}
              aria-controls="discover-panel-browse"
              tabIndex={mode === 'browse' ? 0 : -1}
              className={`seg-btn${mode === 'browse' ? ' active' : ''}`}
              onPointerDown={loadDiscoverBrowse}
              onFocus={loadDiscoverBrowse}
              onClick={() => selectMode('browse')}
            >
              Browse
            </button>
          </div>

          <button
            type="button"
            className="discover-ask-button"
            onPointerDown={warmAsk}
            onFocus={warmAsk}
            onClick={openAsk}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3l1.2 4.1L17 9l-3.8 1.9L12 15l-1.2-4.1L7 9l3.8-1.9L12 3Z" />
              <path d="m18.5 15 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" />
            </svg>
            Ask AI
          </button>
        </div>

        {visited.has('foryou') ? (
          <div
            id="discover-panel-foryou"
            role="tabpanel"
            aria-labelledby="discover-tab-foryou"
            hidden={mode !== 'foryou'}
          >
            <DiscoverForYou onAsk={askAbout} onTune={tuneForYou} />
          </div>
        ) : null}

        {visited.has('browse') ? (
          <div
            id="discover-panel-browse"
            role="tabpanel"
            aria-labelledby="discover-tab-browse"
            hidden={mode !== 'browse'}
          >
            <Suspense fallback={<div className="discover-view-loading">Loading Browse…</div>}>
              <DiscoverBrowse onAsk={askAbout} onCustomize={onCustomize} openFiltersToken={filterToken} />
            </Suspense>
          </div>
        ) : null}
      </div>

      {askOpen ? (
        <div className="discover-ask-view" role="dialog" aria-modal="true" aria-label="Ask GameDeck">
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
          <Suspense fallback={<div className="discover-ask-loading">Starting Ask AI…</div>}>
            <DiscoverAsk seedPrompt={seedPrompt} onSeedConsumed={() => setSeedPrompt(null)} />
          </Suspense>
        </div>
      ) : null}
    </div>
  )
}
