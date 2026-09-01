export default function DiscoverDefaultControl({ checked, onChange, onRestore, restored }) {
  return (
    <div className="filter-default-block">
      <label className="filter-default-row">
        <input
          type="checkbox"
          name="discover-default"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="filter-default-copy">
          <span className="filter-default-title">Save as My Default</span>
          <span className="filter-default-note">Remember these filters. Scale applies to both pages.</span>
        </span>
      </label>
      <div className="filter-default-meta">
        <button type="button" onClick={onRestore}>Restore GameDeck Defaults</button>
      </div>
      {restored ? (
        <span className="filter-default-status" role="status" aria-live="polite">
          GameDeck defaults restored.
        </span>
      ) : null}
    </div>
  )
}
