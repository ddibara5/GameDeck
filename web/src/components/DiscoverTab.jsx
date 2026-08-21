import { useState } from 'react'
import DiscoverBrowse from './DiscoverBrowse.jsx'
import DiscoverForYou from './DiscoverForYou.jsx'
import DiscoverAsk from './DiscoverAsk.jsx'
import './discover.css'

// Discover is three modes behind a segmented control:
//   For you - a vertical feed of unowned, on-platform games, each row carrying
//             the reason it is there (see DiscoverForYou)
//   Browse  - the filterable IGDB catalog (rails, presets, search, detail
//             sheets), UNCHANGED
//   Ask     - the AI game-picker chat, unchanged
//
// For you leads, because it is the answer to "what should I play" and Browse is
// the answer to "show me the storefront", and the first question is the one
// this tab is opened for. Browse is not replaced or reduced: the feed narrows
// hard by design, and the wider catalog has to stay one tap away or the
// narrowing becomes a cage.
export default function DiscoverTab({ onCustomize }) {
  const [subTab, setSubTab] = useState('foryou')
  const [seedPrompt, setSeedPrompt] = useState(null)

  function askAbout(game) {
    const bits = [`What can you tell me about "${game.name}"`]
    if (game.year) bits.push(` (${game.year})`)
    bits.push('? Would it fit my taste, and is it on Game Pass?')
    setSeedPrompt(bits.join(''))
    setSubTab('ask')
  }

  return (
    <div className="discover-page">
      <div className="discover-topbar">
        <div className="page-header">
          <p className="page-subtitle">New releases, and games picked against your library.</p>
        </div>
        <div className="seg discover-seg" role="tablist" aria-label="Discover mode">
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'foryou'}
            className={`seg-btn${subTab === 'foryou' ? ' active' : ''}`}
            onClick={() => setSubTab('foryou')}
          >
            For you
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'browse'}
            className={`seg-btn${subTab === 'browse' ? ' active' : ''}`}
            onClick={() => setSubTab('browse')}
          >
            Browse
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'ask'}
            className={`seg-btn${subTab === 'ask' ? ' active' : ''}`}
            onClick={() => setSubTab('ask')}
          >
            Ask AI
          </button>
        </div>
      </div>

      {/* All three stay mounted so chat history / scroll survive tab flips; only
          one shows. */}
      <div style={{ display: subTab === 'foryou' ? 'block' : 'none' }}>
        <DiscoverForYou onAsk={askAbout} />
      </div>
      <div style={{ display: subTab === 'browse' ? 'block' : 'none' }}>
        <DiscoverBrowse onAsk={askAbout} onCustomize={onCustomize} />
      </div>
      <div style={{ display: subTab === 'ask' ? 'block' : 'none' }}>
        <DiscoverAsk seedPrompt={seedPrompt} onSeedConsumed={() => setSeedPrompt(null)} />
      </div>
    </div>
  )
}
