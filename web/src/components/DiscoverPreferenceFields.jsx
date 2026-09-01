import { PLATFORM_CHOICES, setDiscoverPrefs } from '../lib/discoverPrefs.js'

export default function DiscoverPreferenceFields({ prefs, onChange, deferred = false, compact = false }) {
  function update(next) {
    if (!deferred) setDiscoverPrefs(next)
    if (onChange) onChange(next)
  }

  return (
    <>
      <div className={`filter-group${compact ? ' filter-group-compact' : ''}`}>
        <div className="filter-label-row">
          <span className="filter-label">Platforms</span>
          <span className="filter-note">Shared</span>
        </div>
        <div className={`filter-options${compact ? ' compact' : ''}`}>
          <button
            type="button"
            className={`filter-opt${prefs.platforms.length === 0 ? ' active' : ''}`}
            aria-pressed={prefs.platforms.length === 0}
            onClick={() => update({ ...prefs, platforms: [] })}
          >
            All platforms
          </button>
          {PLATFORM_CHOICES.map((option) => {
            const selected = prefs.platforms.includes(option.key)
            return (
              <button
                key={option.key}
                type="button"
                className={`filter-opt${selected ? ' active' : ''}`}
                aria-pressed={selected}
                onClick={() => update({
                  ...prefs,
                  platforms: selected
                    ? prefs.platforms.filter((key) => key !== option.key)
                    : [...prefs.platforms, option.key],
                })}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className={`filter-group${compact ? ' filter-group-compact' : ''}`}>
        {compact ? (
          <button
            type="button"
            className="filter-setting-row"
            aria-pressed={prefs.hideOwned}
            onClick={() => update({ ...prefs, hideOwned: !prefs.hideOwned })}
          >
            <span className="filter-setting-copy">
              <span className="filter-setting-title">Hide owned games</span>
              <span className="filter-setting-note">Remove games already in your library</span>
            </span>
            <span className={`filter-switch${prefs.hideOwned ? ' on' : ''}`} aria-hidden="true">
              <span />
            </span>
          </button>
        ) : (
          <>
            <span className="filter-label">Library</span>
            <div className="filter-options">
              <button
                type="button"
                className={`filter-opt${prefs.hideOwned ? ' active' : ''}`}
                aria-pressed={prefs.hideOwned}
                onClick={() => update({ ...prefs, hideOwned: true })}
              >
                Hide owned
              </button>
              <button
                type="button"
                className={`filter-opt${!prefs.hideOwned ? ' active' : ''}`}
                aria-pressed={!prefs.hideOwned}
                onClick={() => update({ ...prefs, hideOwned: false })}
              >
                Include owned
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
