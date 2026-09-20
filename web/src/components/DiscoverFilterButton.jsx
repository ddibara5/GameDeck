export default function DiscoverFilterButton({ activeCount = 0, label = null, onClick }) {
  const buttonLabel = label || 'Filters'
  const accessibleLabel = activeCount ? `${buttonLabel}, ${activeCount} active` : buttonLabel

  return (
    <button
      type="button"
      className={`filter-btn${activeCount ? ' active' : ''}`}
      onClick={onClick}
      aria-label={accessibleLabel}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M4 6h16M7 12h10M10 18h4" />
      </svg>
      {label ? <span className="filter-btn-label">{label}</span> : null}
      {activeCount ? <span className="filter-count">{activeCount}</span> : null}
    </button>
  )
}
