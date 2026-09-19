import { useState } from 'react'
import ForYouAction from './ForYouAction.jsx'
import './forYou.css'

// "Tune your mix" sheet content, ported from the pilot's for-you-taste.tsx.
// Per-taste Show less / Default / Show more preferences feed the engine's
// next mix; hidden games restore through recommendationDismissals.
// PWA adaptations: the taste list comes from the tasteEvidence profile
// (lanes + saved less/more preferences), and "View your taste profile" is
// folded into the Your tastes group itself.
const TASTE_OPTIONS = [
  { value: 'less', label: 'Show less' },
  { value: 'default', label: 'Default' },
  { value: 'more', label: 'Show more' },
]

function SettingsRow({ title, value, expanded, disabled, last, onPress }) {
  return (
    <button
      type="button"
      className={`fy-taste-row${last || expanded ? ' no-border' : ''}`}
      aria-label={value ? `${title}, ${value}` : title}
      aria-expanded={expanded === undefined ? undefined : expanded}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onPress}
    >
      <span className="fy-taste-row-body">
        <span className="fy-taste-row-title">{title}</span>
        {value ? (
          <span className={`fy-taste-row-value${value === 'Default' ? ' muted' : ''}`}>
            {value}
          </span>
        ) : null}
      </span>
      <span className="fy-taste-row-chevron" aria-hidden="true">
        {expanded ? '\u2304' : '\u203a'}
      </span>
    </button>
  )
}

function Group({ title, children }) {
  return (
    <div className="fy-taste-group">
      {title ? (
        <h3 className="fy-taste-group-title">{title}</h3>
      ) : null}
      <div className="fy-taste-card">{children}</div>
    </div>
  )
}

function SegmentedTaste({ label, value, disabled, onChange }) {
  return (
    <div
      className="fy-segmented"
      role="radiogroup"
      aria-label={`${label} preference`}
    >
      {TASTE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`fy-segmented-option${value === option.value ? ' selected' : ''}`}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export default function ForYouTaste({
  lanes = [],
  less = [],
  more = [],
  hidden = [],
  disabled = false,
  notice = null,
  onFilters,
  onRankings = null,
  onPreference,
  onRestore,
}) {
  const [expanded, setExpanded] = useState(null)
  const [hiddenOpen, setHiddenOpen] = useState(false)
  const [edited, setEdited] = useState(false)
  const hiddenGames = hidden.slice(0, 40)
  const otherPreferences = [...less, ...more].filter(
    (p) => !lanes.some((l) => l.key === p.key),
  )
  const tastes = [
    ...lanes.map((lane) => ({
      key: lane.key,
      label: lane.label,
      evidence: evidenceText(lane),
    })),
    ...otherPreferences.map((preference) => ({
      key: preference.key,
      label: preference.label,
      evidence: 'A preference you saved for future recommendations.',
    })),
  ]

  return (
    <div className="fy-taste">
      <p className="fy-taste-secondary">Fine-tune what appears in your next mix.</p>
      <Group title="Preferences">
        <SettingsRow
          title="Filters & discovery balance"
          disabled={disabled}
          onPress={onFilters}
        />
        {onRankings ? (
          <SettingsRow
            title="Rate games"
            value="Rankings"
            disabled={disabled}
            last
            onPress={onRankings}
          />
        ) : null}
      </Group>
      {tastes.length ? (
        <Group title="Your tastes">
          {tastes.map((taste, index) => {
            const direction = less.some((p) => p.key === taste.key)
              ? 'less'
              : more.some((p) => p.key === taste.key)
                ? 'more'
                : 'default'
            const open = expanded === taste.key
            const last = index === tastes.length - 1
            return (
              <div key={taste.key} className="fy-taste-item">
                <SettingsRow
                  title={taste.label}
                  value={TASTE_OPTIONS.find((option) => option.value === direction).label}
                  expanded={open}
                  disabled={disabled}
                  last={last}
                  onPress={() => setExpanded(open ? null : taste.key)}
                />
                {open ? (
                  <div className={`fy-taste-detail${last ? ' no-border' : ''}`}>
                    <SegmentedTaste
                      label={taste.label}
                      value={direction}
                      disabled={disabled}
                      onChange={(next) => {
                        setEdited(true)
                        onPreference(taste.key, taste.label, next)
                      }}
                    />
                    <p className="fy-taste-secondary">{taste.evidence}</p>
                    <p className="fy-taste-secondary">
                      Default follows your ratings and play history.
                    </p>
                  </div>
                ) : null}
              </div>
            )
          })}
        </Group>
      ) : (
        <p className="fy-taste-secondary">
          Rate a few games to build your taste profile.
        </p>
      )}
      <Group>
        <SettingsRow
          title="Hidden games"
          value={String(hidden.length)}
          expanded={hiddenOpen}
          disabled={disabled}
          last
          onPress={() => setHiddenOpen(!hiddenOpen)}
        />
        {hiddenOpen ? (
          <div className="fy-taste-hidden">
            {hiddenGames.length ? (
              hiddenGames.map((game) => (
                <div key={game.igdb_id} className="fy-taste-hidden-row">
                  <span className="fy-taste-hidden-title">{game.title}</span>
                  <ForYouAction
                    compact
                    plain
                    label="Restore"
                    accessibilityLabel={`Restore ${game.title}`}
                    disabled={disabled}
                    onPress={() => {
                      setEdited(true)
                      onRestore(game.igdb_id)
                    }}
                  />
                </div>
              ))
            ) : (
              <p className="fy-taste-secondary">
                No hidden games. Games you hide can be restored here.
              </p>
            )}
            {hidden.length > 40 ? (
              <p className="fy-taste-secondary">
                Showing the latest 40. Restore games to reveal earlier choices.
              </p>
            ) : null}
          </div>
        ) : null}
      </Group>
      {edited && notice ? (
        <p className="fy-taste-notice" aria-live="polite">{notice}</p>
      ) : null}
      <p className="fy-taste-secondary">
        Changes apply to your next mix. Preferences are saved for your account
        on this device.
      </p>
    </div>
  )
}

function evidenceText(lane) {
  const count = Number(lane.positiveSourceCount) || 0
  const supporting = Number(lane.supportingGameCount) || 0
  const exemplar = lane.exemplar?.title
  if (count > 0) {
    const games = `${count} ${count === 1 ? 'positively rated game' : 'positively rated games'}`
    return exemplar
      ? `Based on ${games}, including ${exemplar}.`
      : `Based on ${games}.`
  }
  if (supporting > 0) {
    return `Supported by play history from ${supporting} ${supporting === 1 ? 'game' : 'games'}.`
  }
  return 'A preference you saved for future recommendations.'
}
