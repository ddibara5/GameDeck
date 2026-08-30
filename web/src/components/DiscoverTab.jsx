import { lazy, Suspense, useEffect, useState } from 'react'
import DiscoverForYou from './DiscoverForYou.jsx'
import { preloadMarkdown } from './ChatMessage.jsx'
import { useDialogA11y } from '../lib/useDialogA11y.js'
import { useEdgeBack } from '../lib/useEdgeBack.js'
import { lockScroll } from '../lib/scrollLock.js'
import './discover.css'

const loadDiscoverBrowse = () => import('./DiscoverBrowse.jsx')
const loadDiscoverAsk = () => import('./DiscoverAsk.jsx')
const DiscoverBrowse = lazy(loadDiscoverBrowse)
const DiscoverAsk = lazy(loadDiscoverAsk)

export default function DiscoverTab({ onCustomize }) {
  const [browseOpen, setBrowseOpen] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const [seedPrompt, setSeedPrompt] = useState(null)
  const askDialogRef = useDialogA11y({ active: askOpen, onClose: () => setAskOpen(false) })

  useEdgeBack(closeBrowse, {
    register: browseOpen,
    disabled: !browseOpen || askOpen,
  })

  useEffect(() => {
    if (!browseOpen) return undefined
    return lockScroll()
  }, [browseOpen])

  function openBrowse() {
    loadDiscoverBrowse()
    setBrowseOpen(true)
  }

  function closeBrowse() {
    setBrowseOpen(false)
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
      <div className="discover-base" hidden={askOpen || browseOpen}>
        <DiscoverForYou onAsk={askAbout} onOpenAsk={openAsk} onBrowse={openBrowse} />
      </div>

      {browseOpen ? (
        <section className="discover-browse-page" aria-label="Browse games">
          <header className="discover-browse-header">
            <button type="button" className="discover-browse-back" aria-label="Back to Discover" onClick={closeBrowse}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <h1>Browse</h1>
          </header>
          <div className="discover-browse-scroll">
            <Suspense fallback={<div className="discover-view-loading" role="status">Loading Browse…</div>}>
              <DiscoverBrowse
                onAsk={askAbout}
                onCustomize={onCustomize}
              />
            </Suspense>
          </div>
        </section>
      ) : null}

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
