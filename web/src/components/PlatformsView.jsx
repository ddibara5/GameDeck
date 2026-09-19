import { useState } from 'react'
import {
  PLATFORM_CHOICES,
  getDiscoverPrefs,
  setDiscoverPrefs,
} from '../lib/discoverPrefs.js'
import './platforms.css'

// Port of the Expo pilot's Platforms screen (Sept 10 commit,
// `src/app/(tabs)/more/platforms.tsx` -> `src/screens/platforms.tsx`), which
// renders `<QuickSetup always />`: a standing "where do you play" platform
// picker.
//
// The PWA's equivalent store is the standing Discover preferences
// (`discoverPrefs.js`, same four platform slugs as the pilot's
// `platformOptions`): Discover and For You read them on every visit. This view
// edits that set with an explicit Save, and can be mounted as a Settings
// sub-page (the pilot had it under More) or as a standalone view.
export default function PlatformsView({ onBack }) {
  const [platforms, setPlatforms] = useState(() => getDiscoverPrefs().platforms)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  function toggle(key) {
    if (busy) return
    setNotice('')
    setPlatforms((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  function save() {
    if (busy) return
    setBusy(true)
    setNotice('')
    try {
      const current = getDiscoverPrefs()
      setDiscoverPrefs({ ...current, platforms })
      setNotice('Preferences saved.')
    } catch {
      setNotice('Couldn\u2019t save preferences. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pv">
      {onBack ? (
        <button type="button" className="pv-back" onClick={onBack} aria-label="Back">
          \u2039 Back
        </button>
      ) : null}
      <h2 className="pv-title">Your platforms</h2>
      <div className="pv-card">
        <p className="pv-copy">
          Choose where you play. Leave all unselected to explore every platform.
        </p>
        <div className="pv-chips" role="group" aria-label="Platforms">
          {PLATFORM_CHOICES.map(({ key, label }) => {
            const selected = platforms.includes(key)
            return (
              <button
                key={key}
                type="button"
                aria-pressed={selected}
                className={`pv-chip${selected ? ' active' : ''}`}
                disabled={busy}
                onClick={() => toggle(key)}
              >
                {label}
              </button>
            )
          })}
        </div>
        <p className="pv-hint">
          Saved on this device. Discover and For You use these platforms unless
          you save different filters there.
        </p>
        {notice ? (
          <p className="pv-notice" role="status" aria-live="polite">{notice}</p>
        ) : null}
        <button
          type="button"
          className="pv-save"
          disabled={busy}
          onClick={save}
        >
          {busy ? 'Saving\u2026' : 'Save platforms'}
        </button>
      </div>
    </div>
  )
}
