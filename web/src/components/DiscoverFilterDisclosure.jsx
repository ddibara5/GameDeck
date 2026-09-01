export default function DiscoverFilterDisclosure({ label, value, open, onToggle, children }) {
  return (
    <section className={`filter-disclosure${open ? ' open' : ''}`}>
      <button
        type="button"
        className="filter-disclosure-trigger"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="filter-disclosure-copy">
          <span className="filter-disclosure-label">{label}</span>
          <span className="filter-disclosure-value">{value}</span>
        </span>
        <svg className="filter-disclosure-caret" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? <div className="filter-disclosure-body">{children}</div> : null}
    </section>
  )
}
