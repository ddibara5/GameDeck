import { PLATFORM_CHOICES, setDiscoverPrefs } from '../lib/discoverPrefs.js'

export default function DiscoverPreferenceFields({ prefs, onChange }) {
  function update(next) {
    setDiscoverPrefs(next)
    if (onChange) onChange(next)
  }

  return (
    <>
      <div className="filter-group">
        <span className="filter-label">Platforms</span>
        <span className="filter-note">Remembered between visits</span>
        <div className="filter-options">
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

      <div className="filter-group">
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
      </div>
    </>
  )
}
