import { useState } from 'react'
import './FilterBuilder.css'

// Web port of the pilot's `src/components/filter-builder.tsx` (added in the
// Sept 10 commit). A shared "add filters / edit active filters" builder: the
// coordinator builds an array of FilterField objects (e.g. via singleFilter)
// and FilterBuilder renders the selected/active list plus the "add filters"
// chip row. It owns no filter state of its own; each field carries its own
// value, summary, and remove callback.
//
// FilterField shape (same as the pilot):
//   { id, label, summary, active, onRemove, editor }
//     id       stable key for the field
//     label    display name ("Platforms")
//     summary  current-value text shown under the title ("PS5")
//     active   whether the field currently narrows results
//     onRemove () => void, resets the field to its clear value
//     editor   ReactNode rendered when the field card is expanded

// Builds a single-select FilterField from a choice list, matching the pilot's
// singleFilter helper. The editor is a full-width option list; when there are
// more than 6 options it renders in a capped scroll region (264px, same as
// the pilot's FilterPicker), otherwise it renders in place.
export function singleFilter(id, label, value, clearValue, options, onSelect) {
  const editor = <FilterOptionList options={options} selected={value} onSelect={onSelect} />
  return {
    id,
    label,
    active: value !== clearValue,
    summary: options.find((option) => option.value === value)?.label ?? value,
    onRemove: () => onSelect(clearValue),
    editor:
      options.length > 6 ? (
        <div className="fb-editor-scroll" role="group" aria-label={`${label} options`}>
          {editor}
        </div>
      ) : (
        editor
      ),
  }
}

// Internal option list: mirrors the pilot's FilterOptions rows (label row with
// a check on the active choice). Kept unexported; the PWA's pill-style
// `.filter-opt` buttons already cover other filter surfaces.
function FilterOptionList({ options, selected, onSelect }) {
  return (
    <div className="fb-options" role="group">
      {options.map((option) => {
        const active = option.value === selected
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            className={`fb-opt${active ? ' active' : ''}`}
            onClick={() => onSelect(option.value)}
          >
            <span className="fb-opt-label">{option.label}</span>
            {active ? (
              <span className="fb-opt-check" aria-hidden="true">
                &#10003;
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export default function FilterBuilder({ fields }) {
  const [added, setAdded] = useState([])
  const [expanded, setExpanded] = useState(null)

  // Same partition as the pilot: active fields plus ones the user just added
  // stay in the selected list; everything else is offered as an add chip.
  const selected = fields.filter((field) => field.active || added.includes(field.id))
  const available = fields.filter((field) => !field.active && !added.includes(field.id))

  return (
    <div className="fb">
      {selected.length ? (
        <div className="fb-section">
          <h3 className="fb-h">Selected filters</h3>
          {selected.map((field) => {
            const open = expanded === field.id
            return (
              <div key={field.id} className={`fb-card${open ? ' open' : ''}`}>
                <div className="fb-card-head">
                  <button
                    type="button"
                    className="fb-card-toggle"
                    aria-expanded={open}
                    aria-label={`Edit ${field.label}: ${field.summary}`}
                    onClick={() => setExpanded(open ? null : field.id)}
                  >
                    <span className="fb-card-title">{field.label}</span>
                    <svg
                      className={`fb-caret${open ? ' open' : ''}`}
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="fb-remove"
                    aria-label={`Remove ${field.label} filter`}
                    onClick={() => {
                      field.onRemove()
                      setAdded((current) => current.filter((id) => id !== field.id))
                      setExpanded(null)
                    }}
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                </div>
                <div className="fb-summary">{field.summary}</div>
                {open ? <div className="fb-editor">{field.editor}</div> : null}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="fb-empty">No filters selected. Add a filter to narrow your games.</p>
      )}

      {available.length ? (
        <div className="fb-section">
          <h3 className="fb-h">Add filters</h3>
          <div className="fb-chips">
            {available.map((field) => (
              <button
                key={field.id}
                type="button"
                className="fb-chip"
                aria-label={`Add ${field.label} filter`}
                onClick={() => {
                  setAdded((current) => [...current, field.id])
                  setExpanded(field.id)
                }}
              >
                <span className="fb-chip-label">{field.label}</span>
                <span className="fb-chip-plus" aria-hidden="true">
                  +
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
