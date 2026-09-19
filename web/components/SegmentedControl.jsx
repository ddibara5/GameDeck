import { useRef } from 'react'
import './SegmentedControl.css'

// Web equivalent of the pilot's segmented-control pair (Sept 10 added the
// native iOS SwiftUI variant `segmented-control.ios.tsx`; the shared props
// live on the base `segmented-control.tsx`).
//
// The iOS variant's distinctive behaviors on web:
//   - native-style segmented picker look -> reuses the PWA's existing
//     `.seg` / `.seg-btn` styles so theming stays identical across theme
//     families instead of painting a second look;
//   - `disabled` support -> honored (control dims, buttons inert);
//   - single-select only, and onChange fires only when the value actually
//     changes to one of the offered options.
//
// Keyboard: proper radiogroup semantics. Arrow keys move between segments,
// Home/End jump to the ends, Enter/Space activates the focused segment.
// Roving tabindex keeps Tab order to a single stop.
//
// Props:
//   label    string, accessible name for the group
//   options  [{ value, label }] in order; value may be string or number
//   value    currently selected value
//   onChange (next) => void, called only when next differs from value and
//            is one of options[].value
//   disabled bool, optional (default false)

export default function SegmentedControl({ label, options, value, onChange, disabled = false }) {
  const refs = useRef([])
  refs.current = []
  const values = options.map((option) => option.value)

  function pick(next) {
    if (disabled) return
    if (next !== value && values.includes(next)) onChange(next)
  }

  function onKeyDown(event) {
    const index = values.indexOf(value)
    let next
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = values[(index + 1) % values.length]
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        next = values[(index - 1 + values.length) % values.length]
        break
      case 'Home':
        next = values[0]
        break
      case 'End':
        next = values[values.length - 1]
        break
      default:
        return
    }
    event.preventDefault()
    pick(next)
    refs.current[values.indexOf(next)]?.focus()
  }

  return (
    <div
      className={`seg${disabled ? ' seg-disabled' : ''}`}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[index] = element
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            disabled={disabled}
            tabIndex={selected ? 0 : -1}
            className={`seg-btn${selected ? ' active' : ''}`}
            onClick={() => pick(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
