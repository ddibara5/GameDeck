import { PRODUCTION_SCALES } from '../lib/productionScale.js'

export default function DiscoverProductionScaleField({ selectedScales, onToggle }) {
  return (
    <div className="filter-group filter-group-compact">
      <div className="filter-label-row">
        <span className="filter-label">Production scale</span>
        <span className="filter-note">Tap to include or hide</span>
      </div>
      <div className="filter-options production-scale-options">
        {PRODUCTION_SCALES.map((scale) => {
          const selected = selectedScales.includes(scale.key)
          return (
            <button
              key={scale.key}
              type="button"
              className={`filter-opt scale-opt${selected ? ' active' : ''}`}
              aria-pressed={selected}
              onClick={() => onToggle(scale.key)}
            >
              <span>{scale.label}</span>
              <span className="scale-state" aria-hidden="true">{selected ? '✓' : '−'}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
