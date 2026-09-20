import FilterBuilder, { singleFilter } from './FilterBuilder.jsx'
import { PLATFORM_CHOICES } from '../lib/discoverPrefs.js'
import { PRODUCTION_SCALES, PRODUCTION_SCALE_KEYS } from '../lib/productionScale.js'

// Presentation only: edits stay in DiscoverBrowse's draft until Show results.
export default function BrowseFilterFields({ filters, setFilters, prefs, setPrefs, preset, setPreset, onAvailability, onScale, genres, vibes, years, sorts, availability }) {
  const options = (choices) => choices.map(({ key, label }) => ({ value: key, label }))
  const setField = (key) => (value) => setFilters((current) => ({ ...current, [key]: value }))
  const fields = [
    {
      id: 'platforms', label: 'Platforms', active: prefs.platforms.length > 0,
      summary: PLATFORM_CHOICES.filter((p) => prefs.platforms.includes(p.key)).map((p) => p.label).join(' · ') || 'All platforms',
      onRemove: () => setPrefs({ ...prefs, platforms: [] }),
      editor: <div className="fb-options" role="group" aria-label="Platforms">
        {[{ key: 'all', label: 'All platforms' }, ...PLATFORM_CHOICES].map((p) => {
          const selected = p.key === 'all' ? prefs.platforms.length === 0 : prefs.platforms.includes(p.key)
          return <button type="button" className={`fb-opt${selected ? ' active' : ''}`} key={p.key} aria-pressed={selected} onClick={() => setPrefs({ ...prefs, platforms: p.key === 'all' ? [] : selected ? prefs.platforms.filter((key) => key !== p.key) : [...prefs.platforms, p.key] })}>
            <span className="fb-opt-label">{p.label}</span>{selected && <span className="fb-opt-check" aria-hidden="true">✓</span>}
          </button>
        })}
      </div>,
    },
    singleFilter('ownership', 'Ownership', prefs.hideOwned, false, [
      { value: true, label: 'Hide owned games' }, { value: false, label: 'Include owned games' },
    ], (hideOwned) => setPrefs({ ...prefs, hideOwned })),
    {
      id: 'scale', label: 'Production scale', active: filters.scales.length !== PRODUCTION_SCALE_KEYS.length,
      summary: PRODUCTION_SCALES.filter((s) => filters.scales.includes(s.key)).map((s) => s.label).join(' · ') || 'No scales selected',
      onRemove: () => setField('scales')([...PRODUCTION_SCALE_KEYS]),
      editor: <div className="fb-options" role="group" aria-label="Production scale">
        {PRODUCTION_SCALES.map((s) => <button type="button" className={`fb-opt${filters.scales.includes(s.key) ? ' active' : ''}`} key={s.key} aria-pressed={filters.scales.includes(s.key)} onClick={() => onScale(s.key)}>
          <span className="fb-opt-label">{s.label}</span>{filters.scales.includes(s.key) && <span className="fb-opt-check" aria-hidden="true">✓</span>}
        </button>)}
      </div>,
    },
    singleFilter('availability', 'Availability', filters.status, 'all', options(availability), onAvailability),
    singleFilter('genre', 'Genre', filters.genre, 'all', options(genres), setField('genre')),
    singleFilter('vibe', 'Vibe', preset, null, [{ value: null, label: 'Any vibe' }, ...options(vibes)], setPreset),
    singleFilter('year', 'Release year', filters.year, 'all', years.map((year) => ({ value: year, label: year === 'all' ? 'Any year' : String(year) })), setField('year')),
    singleFilter('sort', 'Sort by', filters.sort, 'popularity', options(sorts), setField('sort')),
  ]
  return <FilterBuilder fields={fields} />
}
