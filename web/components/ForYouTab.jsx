import { useState } from 'react'
import { forYouLaneLabel, localDay } from '../lib/forYouEngine.js'
import {
  forYouFilterKey,
  loadForYouFilters,
  saveForYouFilters,
} from '../lib/forYou.js'
import { useForYouDeck } from '../lib/useForYouDeck.js'
import { useRecommendationDismissals } from '../lib/recommendationDismissals.js'
import ForYouAction from './ForYouAction.jsx'
import ForYouRow from './ForYouRow.jsx'
import ForYouSheet from './ForYouSheet.jsx'
import ForYouTaste from './ForYouTaste.jsx'
import LazyGameSheet from './LazyGameSheet.jsx'
import './forYou.css'

const SCALE_OPTIONS = [
  { key: 'aaa', label: 'AAA' },
  { key: 'aa', label: 'AA' },
  { key: 'indie', label: 'Indie' },
]
const PLATFORM_OPTIONS = [
  { key: 'xbox', label: 'Xbox' },
  { key: 'psn', label: 'PlayStation' },
]
const MODE_OPTIONS = [
  { key: 'familiar', label: 'Familiar', blurb: 'Stays close to what you already love.' },
  { key: 'balanced', label: 'Balanced', blurb: 'Mixes favorites with fresh ideas.' },
  { key: 'adventurous', label: 'Adventurous', blurb: 'Pushes into new territory.' },
]
const AVAILABILITY_OPTIONS = [
  { key: 'all', label: 'All games' },
  { key: 'released', label: 'Released only' },
]

function toggleInList(list, key, { allowEmpty = true } = {}) {
  const next = list.includes(key) ? list.filter((item) => item !== key) : [...list, key]
  if (!allowEmpty && next.length === 0) return list
  return next
}

function WhyContent({ pick, laneLabel }) {
  const game = pick.game
  const title = game.title || game.name
  const cover = game.artwork || game.cover
  const metadata = [
    (game.platforms || []).slice(0, 2).join(' \u00b7 '),
    game.releaseLabel ?? game.year ?? 'Release TBA',
  ]
    .filter(Boolean)
    .join(' \u00b7 ')
  const laneEvidence = pick.evidence?.laneEvidence
  const noteParts = []
  if (laneEvidence?.evidenceLabel) {
    noteParts.push(
      `Evidence coverage: ${laneEvidence.evidenceLabel}.`,
    )
  }
  if (pick.evidence?.comparisonCoverageComplete === false) {
    noteParts.push(
      'Comparison coverage is partial: this pick relies more on your ratings and play history until you compare more games.',
    )
  }
  return (
    <div className="fy-why">
      <div className="fy-why-head">
        {cover ? (
          <img src={cover} alt={`${title} cover`} className="fy-why-cover" loading="lazy" />
        ) : null}
        <div>
          <h3 className="fy-why-title">{title}</h3>
          <p className="fy-why-meta">{metadata}</p>
        </div>
      </div>
      <section aria-label="Why this pick">
        <h4 className="fy-why-section-title">Why this</h4>
        {pick.reasons.map((reason, index) => (
          <div className="fy-why-item" key={`${reason.label}-${index}`}>
            <div className="fy-why-source">{reason.label}</div>
            <p className="fy-why-detail">{reason.detail}</p>
          </div>
        ))}
      </section>
      {pick.matchBreakdown?.length ? (
        <section aria-label="Match breakdown">
          <h4 className="fy-why-section-title">Match breakdown</h4>
          {pick.matchBreakdown.map((row, index) => (
            <div className="fy-why-item" key={`${row.title}-${index}`}>
              <div className="fy-why-source">{row.title}</div>
              <p className="fy-why-detail">{row.text}</p>
            </div>
          ))}
        </section>
      ) : null}
      {laneLabel ? (
        <p className="fy-why-note">
          Served from the {laneLabel} catalog lane because your profile ranks
          it in your top tastes.
        </p>
      ) : null}
      {noteParts.length ? (
        <p className="fy-why-note">{noteParts.join(' ')}</p>
      ) : null}
    </div>
  )
}

function OptionsContent({ pick, laneKey, laneLabel, disabled, saving, onSelect }) {
  const title = pick.game.title || pick.game.name
  const options = [
    {
      key: 'wishlist',
      icon: '\u{1F516}',
      label: 'Add to Wishlist',
      sub: 'Move it to your Wishlist instead of the mix.',
    },
  ]
  if (laneKey) {
    options.push(
      {
        key: 'more',
        icon: '\u2795',
        label: `Show more ${laneLabel ? `like ${laneLabel}` : 'like this'}`,
        sub: 'Boosts this taste in your next mix.',
      },
      {
        key: 'less',
        icon: '\u2796',
        label: `Show fewer ${laneLabel ? `like ${laneLabel}` : 'like this'}`,
        sub: 'Reduces this taste in your next mix.',
      },
    )
  }
  options.push(
    {
      key: 'why',
      icon: '\u2753',
      label: 'Why this pick?',
      sub: 'See the evidence behind this recommendation.',
    },
    {
      key: 'hide',
      icon: '\u{1F6AB}',
      label: 'Not interested',
      sub: 'Hide this game from your recommendations.',
    },
  )
  return (
    <div className="fy-options">
      <h3 className="fy-options-title">{title}</h3>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          className="fy-option"
          disabled={disabled || saving}
          onClick={() => onSelect(option.key)}
        >
          <span className="fy-option-icon" aria-hidden="true">{option.icon}</span>
          <span>
            {option.label}
            <span className="fy-option-sub">{option.sub}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

export default function ForYouTab({ onAsk }) {
  const [filters, setFilters] = useState(() => loadForYouFilters())
  const [detailGame, setDetailGame] = useState(null)
  const [optionsPick, setOptionsPick] = useState(null)
  const [whyPick, setWhyPick] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [showTaste, setShowTaste] = useState(false)
  const {
    snapshot,
    loading,
    refreshing,
    batching,
    saving,
    error,
    notice,
    undo,
    load,
    trackExposureRef,
    hide,
    restore,
    wishlist,
    preferTaste,
    clearNotice,
  } = useForYouDeck(filters)
  const { items: hidden } = useRecommendationDismissals()

  const key = forYouFilterKey(filters)
  const deck = snapshot?.key === key && snapshot.day === localDay() ? snapshot.deck : null
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  const updateFilters = (next) => {
    setFilters(next)
    saveForYouFilters(next)
  }

  const closeSheets = () => {
    setOptionsPick(null)
    setWhyPick(null)
    setShowFilters(false)
    setShowTaste(false)
  }

  const handleOption = (action) => {
    const pick = optionsPick
    if (!pick) return
    if (action === 'wishlist') {
      setOptionsPick(null)
      void wishlist(pick)
    } else if (action === 'more' || action === 'less') {
      const laneKey = pick.evidence?.lane
      const lane = snapshot?.evidenceProfile?.lanes?.find((l) => l.key === laneKey)
      setOptionsPick(null)
      if (lane) void preferTaste(lane.key, lane.label, action)
    } else if (action === 'why') {
      setOptionsPick(null)
      setWhyPick(pick)
    } else if (action === 'hide') {
      setOptionsPick(null)
      void hide(pick)
    }
  }

  return (
    <div className="fy-list">
      <div className="fy-list-head">
        <div>
          <h1 className="detail-title">Daily Mix</h1>
          <p className="detail-sub">{today}</p>
        </div>
        <div className="fy-list-actions">
          <ForYouAction
            compact
            label="Tune your mix"
            accessibilityLabel="Tune your mix preferences"
            onPress={() => setShowTaste(true)}
          />
          <ForYouAction
            compact
            label="Filters"
            accessibilityLabel="Open For You filters"
            onPress={() => setShowFilters(true)}
          />
        </div>
      </div>

      {notice ? (
        <div className="fy-notice" role="status" aria-live="polite">
          <span>{notice}</span>
          {undo ? (
            <button type="button" onClick={() => void restore(undo.pick.game.id)}>
              Undo
            </button>
          ) : (
            <button type="button" onClick={clearNotice} aria-label="Dismiss notice">
              Dismiss
            </button>
          )}
        </div>
      ) : null}

      {loading && !deck ? (
        <div className="async-loading" role="status" aria-label="Loading your picks">
          <span className="spinner" aria-hidden="true" />
        </div>
      ) : error && !deck ? (
        <div className="fy-empty">
          <h2 className="fy-empty-title">{error}</h2>
          <ForYouAction primary label="Try again" onPress={() => void load('refresh')} />
        </div>
      ) : deck ? (
        <>
          {deck.length ? (
            <>
              <div className="fy-list-deck" role="list" aria-label="Your daily mix">
                {deck.map((pick) => (
                  <ForYouRow
                    key={pick.game.id}
                    pick={pick}
                    laneLabel={forYouLaneLabel(pick, snapshot.laneKeys)}
                    disabled={saving || refreshing}
                    saving={saving}
                    exposureRef={trackExposureRef(pick.game.id)}
                    onDetails={() => setDetailGame(pick.game)}
                    onWhy={() => setWhyPick(pick)}
                    onOptions={() => setOptionsPick(pick)}
                    onWishlist={() => void wishlist(pick)}
                  />
                ))}
              </div>
              <div className="fy-list-foot">
                <ForYouAction
                  plain
                  label="Different picks"
                  accessibilityLabel="Shuffle to a different mix of picks"
                  busy={batching}
                  disabled={refreshing}
                  onPress={() => void load('batch')}
                />
              </div>
            </>
          ) : (
            <div className="fy-empty">
              <h2 className="fy-empty-title">No picks matched your filters today.</h2>
              <p className="detail-sub">
                Try widening your platforms, scales, or discovery balance.
              </p>
              <ForYouAction
                primary
                label="Adjust filters"
                onPress={() => setShowFilters(true)}
              />
            </div>
          )}
        </>
      ) : null}

      {detailGame ? (
        <LazyGameSheet
          game={detailGame}
          onAsk={(askGame) => {
            setDetailGame(null)
            if (onAsk) onAsk(askGame)
          }}
          onClose={() => setDetailGame(null)}
        />
      ) : null}

      {optionsPick ? (
        <ForYouSheet
          title="Options"
          compact
          busy={saving}
          onClose={() => setOptionsPick(null)}
        >
          <OptionsContent
            pick={optionsPick}
            laneKey={optionsPick.evidence?.lane}
            laneLabel={forYouLaneLabel(optionsPick, snapshot?.laneKeys)}
            disabled={saving}
            saving={saving}
            onSelect={handleOption}
          />
        </ForYouSheet>
      ) : null}

      {whyPick ? (
        <ForYouSheet
          title="Why this pick"
          onClose={() => setWhyPick(null)}
        >
          <WhyContent
            pick={whyPick}
            laneLabel={forYouLaneLabel(whyPick, snapshot?.laneKeys)}
          />
        </ForYouSheet>
      ) : null}

      {showTaste ? (
        <ForYouSheet
          title="Tune your mix"
          busy={saving}
          onClose={() => setShowTaste(false)}
        >
          <ForYouTaste
            lanes={snapshot?.evidenceProfile?.lanes ?? []}
            less={snapshot?.state?.less ?? []}
            more={snapshot?.state?.more ?? []}
            hidden={hidden}
            disabled={saving}
            notice={notice}
            onFilters={() => {
              setShowTaste(false)
              setShowFilters(true)
            }}
            onPreference={(prefKey, label, direction) =>
              void preferTaste(prefKey, label, direction)
            }
            onRestore={(id) => void restore(id)}
          />
        </ForYouSheet>
      ) : null}

      {showFilters ? (
        <ForYouSheet
          title="Filters"
          onClose={() => {
            setShowFilters(false)
            closeSheets()
          }}
        >
          <div className="fy-filters">
            <div className="filter-group">
              <span className="filter-label">Production scale</span>
              <div className="filter-options">
                {SCALE_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`filter-opt${filters.scales.includes(option.key) ? ' active' : ''}`}
                    aria-pressed={filters.scales.includes(option.key)}
                    onClick={() =>
                      updateFilters({
                        ...filters,
                        scales: toggleInList(filters.scales, option.key),
                      })
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-label">Platforms</span>
              <div className="filter-options">
                {PLATFORM_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`filter-opt${filters.platforms.includes(option.key) ? ' active' : ''}`}
                    aria-pressed={filters.platforms.includes(option.key)}
                    onClick={() =>
                      updateFilters({
                        ...filters,
                        platforms: toggleInList(filters.platforms, option.key),
                      })
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-label">Discovery balance</span>
              <div className="filter-options">
                {MODE_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`filter-opt${filters.mode === option.key ? ' active' : ''}`}
                    aria-pressed={filters.mode === option.key}
                    title={option.blurb}
                    onClick={() => updateFilters({ ...filters, mode: option.key })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="fy-taste-secondary">
                {MODE_OPTIONS.find((option) => option.key === filters.mode)?.blurb}
              </p>
            </div>
            <div className="filter-group">
              <span className="filter-label">Availability</span>
              <div className="filter-options">
                {AVAILABILITY_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`filter-opt${filters.availability === option.key ? ' active' : ''}`}
                    aria-pressed={filters.availability === option.key}
                    onClick={() =>
                      updateFilters({ ...filters, availability: option.key })
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-label">Library</span>
              <div className="filter-options">
                <button
                  type="button"
                  className={`filter-opt${filters.hideOwned ? ' active' : ''}`}
                  aria-pressed={filters.hideOwned}
                  onClick={() =>
                    updateFilters({ ...filters, hideOwned: !filters.hideOwned })
                  }
                >
                  Hide owned games
                </button>
              </div>
            </div>
            <div className="fy-filters-actions">
              <ForYouAction
                primary
                label="Done"
                onPress={() => {
                  setShowFilters(false)
                  closeSheets()
                }}
              />
            </div>
          </div>
        </ForYouSheet>
      ) : null}
    </div>
  )
}
