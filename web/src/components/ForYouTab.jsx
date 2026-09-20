import { useEffect, useState } from 'react'
import { forYouLaneLabel, localDay, whyPickReasons } from '../lib/forYouEngine.js'
import {
  defaultForYouFilters,
  forYouFilterKey,
  loadForYouFilters,
  saveForYouFilters,
} from '../lib/forYou.js'
import { useForYouDeck } from '../lib/useForYouDeck.js'
import { useRecommendationDismissals } from '../lib/recommendationDismissals.js'
import { resolveTuneLaunch, consumeLaneDuelReceipt } from '../lib/laneDuel.js'
import ForYouAction from './ForYouAction.jsx'
import DiscoverFilterButton from './DiscoverFilterButton.jsx'
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

function countLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function reactionLabel(reaction) {
  return reaction
    ? reaction.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
    : 'Play history'
}

function sourceDuelSummary(duel, complete) {
  if (!duel?.decidedComparisons) return null
  const record = `${countLabel(duel.wins, 'recorded win')} and ${countLabel(duel.losses, 'recorded loss', 'recorded losses')} across ${countLabel(duel.decidedComparisons, 'decided comparison')}`
  const opponents = duel.uniqueOpponentsDefeated
    ? ` ${complete ? 'Ranked' : 'Within that history, ranked'} above ${countLabel(duel.uniqueOpponentsDefeated, 'unique opponent')}.`
    : ''
  return complete ? `${record}.${opponents}` : `Available duel history includes ${record}.${opponents}`
}

function WhyContent({ pick, laneLabel, evidenceProfile, tuneLaunch, onTuneTaste }) {
  const game = pick.game
  const title = game.title || game.name
  const cover = game.artwork || game.cover
  const metadata = [
    (game.platforms || []).slice(0, 2).join(' · '),
    game.releaseLabel ?? game.year ?? 'Release TBA',
  ]
    .filter(Boolean)
    .join(' · ')
  const evidence = pick.evidence || {}
  const laneEvidence = evidence.laneEvidence
  const activeLane = evidenceProfile?.lanes?.find((lane) => lane.key === evidence.lane)
  const supportingSources = (evidenceProfile?.sources || [])
    .filter((source) => {
      const keys = Array.isArray(source.laneKeys) ? source.laneKeys : []
      const id = String(source.masterId ?? source.id ?? '')
      const sourceId = String(evidence.source?.masterId ?? evidence.source?.id ?? '')
      return keys.includes(evidence.lane) && id && id !== sourceId
    })
    .slice(0, evidence.source ? 2 : 3)
  const noteParts = []
  if (laneEvidence?.evidenceLabel) {
    noteParts.push(`Evidence coverage: ${laneEvidence.evidenceLabel}.`)
  }
  if (evidence.comparisonCoverageComplete === false) {
    noteParts.push(
      'Comparison coverage is partial: this pick relies more on your ratings and play history until you compare more games.',
    )
  }
  const reasons = whyPickReasons(pick)
  const duelEvidence = sourceDuelSummary(
    evidence.source?.duel,
    evidence.comparisonCoverageComplete,
  )

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
        {reasons.map((reason, index) => (
          <div className="fy-why-item" key={`${reason.label}-${index}`}>
            <div className="fy-why-source">{reason.label}</div>
            <p className="fy-why-detail">{reason.detail}</p>
          </div>
        ))}
      </section>
      {laneEvidence ? (
        <section aria-label="Taste evidence">
          <h4 className="fy-why-section-title">Taste evidence</h4>
          <div className="fy-why-item">
            <div className="fy-why-source">{laneEvidence.evidenceLabel || 'Taste signal'}</div>
            <p className="fy-why-detail">
              {laneEvidence.positiveSourceCount > 0
                ? countLabel(laneEvidence.positiveSourceCount, 'positively rated game')
                : `${countLabel(laneEvidence.supportingGameCount, 'game')} from play history`}
              {laneEvidence.uniqueMatchups > 0
                ? ` · ${evidence.comparisonCoverageComplete ? '' : 'at least '}${countLabel(laneEvidence.uniqueMatchups, 'unique matchup')}${evidence.comparisonCoverageComplete ? '' : ' in available history'}`
                : ''}
              {laneEvidence.label ? ` · ${laneEvidence.label} taste` : ''}
            </p>
          </div>
        </section>
      ) : null}
      {evidence.source ? (
        <section aria-label="Closest taste signal">
          <h4 className="fy-why-section-title">Closest taste signal</h4>
          <div className="fy-why-item">
            <div className="fy-why-source">{evidence.source.title}</div>
            <p className="fy-why-detail">
              {reactionLabel(evidence.source.reaction)}
              {duelEvidence ? ` · ${duelEvidence}` : ''}
            </p>
            {evidence.shared?.length ? (
              <p className="fy-why-detail">Shared with this pick: {evidence.shared.join(' · ')}</p>
            ) : null}
          </div>
        </section>
      ) : evidence.shared?.length ? (
        <section aria-label="Shared traits">
          <h4 className="fy-why-section-title">Shared traits</h4>
          <p className="fy-why-detail">{evidence.shared.join(' · ')}</p>
        </section>
      ) : null}
      {supportingSources.length ? (
        <section aria-label="Supporting taste signals">
          <h4 className="fy-why-section-title">
            Also shaping your {activeLane?.label?.toLowerCase() || 'taste'}
          </h4>
          {supportingSources.map((source) => (
            <div className="fy-why-item" key={String(source.masterId ?? source.id)}>
              <div className="fy-why-source">{source.title}</div>
              <p className="fy-why-detail">{reactionLabel(source.reaction)}</p>
            </div>
          ))}
        </section>
      ) : null}
      {laneLabel ? (
        <p className="fy-why-note">
          Served from the {laneLabel} catalog lane because your profile ranks it in your top tastes.
        </p>
      ) : null}
      {noteParts.length ? (
        <p className="fy-why-note">{noteParts.join(' ')}</p>
      ) : null}
      {tuneLaunch ? (
        <ForYouAction
          primary
          label="Tune this taste"
          onPress={() => onTuneTaste(tuneLaunch)}
        />
      ) : null}
      {!evidence.lane ? (
        <p className="fy-why-note">
          This discovery adds variety to your mix. It is not a claim that you will love this game.
        </p>
      ) : null}
      <p className="fy-why-note">
        Your mix balances taste evidence, recent activity, catalog quality, and variety. IGDB ratings reflect public opinion, not a personal match score.
      </p>
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
    {
      key: 'details',
      icon: '↗',
      label: 'View game details',
      sub: 'Open the full game page.',
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

export default function ForYouTab({
  onAsk,
  onBrowse = null,
  onOpenTaste = null,
  onTuneTaste = null,
  onOpenRankings = null,
}) {
  const [filters, setFilters] = useState(() => loadForYouFilters())
  const [detailGame, setDetailGame] = useState(null)
  const [detailRecommendation, setDetailRecommendation] = useState(null)
  const [optionsPick, setOptionsPick] = useState(null)
  const [whyPick, setWhyPick] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [showTaste, setShowTaste] = useState(false)
  const [tunedCard, setTunedCard] = useState(null)
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

  // Lane-duel receipts are in-memory and consume-once: a decided "Tune this
  // taste" duel marks the tuned card with a badge without reloading the
  // day's slate, so deck ids and ordering stay fixed.
  useEffect(() => {
    void consumeLaneDuelReceipt().then((receipt) => {
      if (receipt) setTunedCard(receipt)
    })
  }, [])

  const key = forYouFilterKey(filters)
  const deck = snapshot?.key === key && snapshot.day === localDay() ? snapshot.deck : null
  const filterCount = filters
    ? Number(filters.platforms.length > 0) +
      Number(filters.scales.length !== SCALE_OPTIONS.length) +
      Number(filters.hideOwned) +
      Number(filters.availability !== 'all')
    : 0
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
    } else if (action === 'details') {
      setOptionsPick(null)
      setDetailGame(pick.game)
      setDetailRecommendation(pick)
    } else if (action === 'hide') {
      setOptionsPick(null)
      void hide(pick)
    }
  }

  return (
    <div className="fy-list">
      <div className="fy-list-head">
        <div>
          <h1 className="detail-title">Your daily mix</h1>
          <p className="detail-sub">
            {deck ? `${deck.length} picks for you` : 'A little familiar. A little unexpected.'}
          </p>
        </div>
        <div className="fy-list-actions">
          <DiscoverFilterButton
            label="Filters"
            activeCount={filterCount}
            onClick={() => setShowFilters(true)}
          />
          <button
            type="button"
            className="fy-tune-btn"
            aria-label="Tune your mix"
            disabled={!snapshot || saving}
            onClick={() => setShowTaste(true)}
          >
            <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
              <circle cx="9" cy="6" r="2" fill="var(--surface)" />
              <circle cx="15" cy="12" r="2" fill="var(--surface)" />
              <circle cx="10" cy="18" r="2" fill="var(--surface)" />
            </svg>
          </button>
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
                    tasteUpdate={
                      tunedCard && tunedCard.recommendationId === pick.game.id
                        ? tunedCard.cardLabel
                        : null
                    }
                    disabled={saving || refreshing}
                    saving={saving}
                    exposureRef={trackExposureRef(pick.game.id)}
                    onDetails={() => {
                      setDetailGame(pick.game)
                      setDetailRecommendation(pick)
                    }}
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
              <div className="fy-empty-actions">
                <ForYouAction
                  primary
                  label="Adjust filters"
                  onPress={() => setShowFilters(true)}
                />
                {onBrowse ? (
                  <ForYouAction
                    label="Explore Browse"
                    onPress={onBrowse}
                  />
                ) : null}
              </div>
            </div>
          )}
        </>
      ) : null}

      {detailGame ? (
        <LazyGameSheet
          variant="discover"
          game={detailGame}
          recommendation={detailRecommendation}
          onAsk={(askGame) => {
            setDetailGame(null)
            setDetailRecommendation(null)
            if (onAsk) onAsk(askGame)
          }}
          onClose={() => {
            setDetailGame(null)
            setDetailRecommendation(null)
          }}
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
            evidenceProfile={snapshot?.evidenceProfile}
            tuneLaunch={
              onTuneTaste
                ? resolveTuneLaunch(whyPick, snapshot?.evidenceProfile)
                : null
            }
            onTuneTaste={(launch) => {
              setWhyPick(null)
              onTuneTaste(launch)
            }}
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
            onRankings={onOpenRankings ? () => {
              setShowTaste(false)
              onOpenRankings()
            } : null}
            more={snapshot?.state?.more ?? []}
            hidden={hidden}
            disabled={saving}
            notice={notice}
            onOpenTaste={onOpenTaste ? () => {
              setShowTaste(false)
              onOpenTaste()
            } : null}
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
          title="For You filters"
          onClose={() => {
            setShowFilters(false)
            closeSheets()
          }}
        >
          <div className="fy-filters">
            <div className="fy-filter-summary">
              <div className="fy-filter-summary-title">Selected filters</div>
              <div className="fy-filter-summary-values">
                {filters.platforms.length ? <span>Platforms: {filters.platforms.map((key) => PLATFORM_OPTIONS.find((option) => option.key === key)?.label || key).join(' · ')}</span> : null}
                {filters.hideOwned ? <span>Ownership: Hide owned games</span> : null}
                {filters.scales.length !== SCALE_OPTIONS.length ? <span>Production scale: {filters.scales.map((key) => SCALE_OPTIONS.find((option) => option.key === key)?.label || key).join(' · ') || 'None'}</span> : null}
                {filters.availability !== 'all' ? <span>Availability: Out now</span> : null}
                {filters.mode !== 'balanced' ? <span>Discovery balance: {MODE_OPTIONS.find((option) => option.key === filters.mode)?.label || filters.mode}</span> : null}
                {!filters.platforms.length && !filters.hideOwned && filters.scales.length === SCALE_OPTIONS.length && filters.availability === 'all' && filters.mode === 'balanced' ? <span>Default settings</span> : null}
              </div>
            </div>
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
            <p className="fy-filter-note">Wishlist games are always excluded from For You.</p>
            <div className="fy-filters-actions">
              <button
                type="button"
                className="fy-filter-clear"
                onClick={() => updateFilters(defaultForYouFilters)}
              >
                Clear filters
              </button>
              <ForYouAction
                primary
                label="Show my mix"
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
