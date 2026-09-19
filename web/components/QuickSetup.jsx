import { useEffect, useRef, useState } from 'react'
import { PLATFORM_CHOICES } from '../lib/discoverPrefs.js'
import { loadSetupPreferences, saveSetupPreferences } from '../lib/setupPreferences.js'
import './quickSetup.css'

// First-run platform setup, ported from the Expo pilot's
// src/components/quick-setup.tsx (Sept 10 commit).
//
// Two modes, same as the pilot:
//   default      a first-run card ("Make GameDeck yours"). Renders nothing once
//                setup is completed. The mount site decides where it lives; the
//                pilot showed it on Home before completion.
//   always       an always-visible editor ("Your platforms"), for a settings
//                submenu. The pilot's Platforms settings screen used this mode.
//
// The pilot navigated straight to Rankings on "Save and rate a few games".
// The PWA has no router here, so the mount site passes onDone (after any save)
// and onRateGames (the "rate a few games" path, e.g. navigate to Rankings).
export default function QuickSetup({ always = false, onDone, onRateGames }) {
  const [preferences, setPreferences] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const saving = useRef(false)

  useEffect(() => {
    let active = true
    try {
      const value = loadSetupPreferences()
      if (active) {
        setPreferences(value)
        setNotice(null)
      }
    } catch {
      if (active) setNotice('Setup preferences could not be loaded. Tap to retry.')
    }
    return () => {
      active = false
    }
  }, [attempt])

  // Storage read failed: offer a retry instead of the card.
  if (!preferences) {
    return notice ? (
      <section className="quick-setup" role="status">
        <p className="quick-setup-notice">{notice}</p>
        <button
          type="button"
          className="discover-action"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Try again
        </button>
      </section>
    ) : null
  }

  // First-run card hides itself once setup is completed.
  if (preferences.completed && !always) return null

  const togglePlatform = (value) => {
    if (busy) return
    setPreferences({
      ...preferences,
      platforms: preferences.platforms.includes(value)
        ? preferences.platforms.filter((item) => item !== value)
        : [...preferences.platforms, value],
    })
  }

  const save = (rate, skip = false) => {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setNotice(null)
    try {
      const next = {
        platforms: skip ? [] : preferences.platforms,
        completed: true,
      }
      saveSetupPreferences(next)
      setPreferences(next)
      setNotice('Preferences saved.')
      if (rate) onRateGames && onRateGames()
      else if (onDone) onDone()
    } catch {
      setNotice("Couldn't save preferences. Please try again.")
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return (
    <section
      className={`quick-setup${always ? ' quick-setup-compact' : ''}`}
      aria-labelledby={always ? undefined : 'quick-setup-title'}
    >
      {!always ? (
        <h2 id="quick-setup-title" className="quick-setup-title">
          Make GameDeck yours
        </h2>
      ) : null}
      <p className="quick-setup-caption">
        {always
          ? 'Choose where you play. Leave all unselected to explore every platform.'
          : 'Where do you play? Choose any, or leave all unselected to explore every platform.'}
      </p>
      <div className="filter-options" role="group" aria-label="Platforms">
        {PLATFORM_CHOICES.map((option) => {
          const selected = preferences.platforms.includes(option.key)
          return (
            <button
              key={option.key}
              type="button"
              className={`filter-opt${selected ? ' active' : ''}`}
              aria-pressed={selected}
              disabled={busy}
              onClick={() => togglePlatform(option.key)}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      <p className="quick-setup-note">
        Saved for your account on this device. Discover and For You use these
        platforms unless you save different filters there.
      </p>
      {notice ? (
        <p className="quick-setup-notice" role="status">
          {notice}
        </p>
      ) : null}
      <div className="quick-setup-actions">
        <button
          type="button"
          className="discover-action primary"
          disabled={busy}
          onClick={() => save(false)}
        >
          {always ? 'Save platforms' : 'Save and explore'}
        </button>
        {!always ? (
          <button
            type="button"
            className="discover-action"
            disabled={busy}
            onClick={() => save(true)}
          >
            Save and rate a few games
          </button>
        ) : null}
        {!always ? (
          <button
            type="button"
            className="quick-setup-skip"
            disabled={busy}
            onClick={() => save(false, true)}
          >
            Skip setup
          </button>
        ) : null}
      </div>
    </section>
  )
}
