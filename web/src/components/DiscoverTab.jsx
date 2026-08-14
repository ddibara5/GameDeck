import { useState } from 'react'
import DiscoverBrowse from './DiscoverBrowse.jsx'
import DiscoverAsk from './DiscoverAsk.jsx'
import './discover.css'

// Discover is now two modes behind a segmented control:
//   Browse - a filterable IGDB catalog (rails, presets, search, detail sheets)
//   Ask    - the existing AI game-picker chat (unchanged behaviour)
// "Ask AI about this" from a Browse detail sheet flips to Ask with a seed prompt.
export default function DiscoverTab({ onCustomize }) {
  const [subTab, setSubTab] = useState('browse')
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
          <h1 className="page-title">Discover</h1>
          <p className="page-subtitle">New releases, and games picked against your library.</p>
        </div>
        <div className="seg discover-seg" role="tablist" aria-label="Discover mode">
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

      {/* Both stay mounted so chat history / scroll survive tab flips; only one shows. */}
      <div style={{ display: subTab === 'browse' ? 'block' : 'none' }}>
        <DiscoverBrowse onAsk={askAbout} onCustomize={onCustomize} />
      </div>
      <div style={{ display: subTab === 'ask' ? 'block' : 'none' }}>
        <DiscoverAsk seedPrompt={seedPrompt} onSeedConsumed={() => setSeedPrompt(null)} />
      </div>
    </div>
  )
}
