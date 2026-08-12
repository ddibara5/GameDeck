// Shared drawer / settings UI: relative-time formatter, icon set, and the
// MenuItem row. Used by both the left drawer (Menu) and the Settings page.

export function relTime(ts) {
  if (!ts) return null
  const diff = Date.now() - new Date(ts).getTime()
  if (Number.isNaN(diff)) return null
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const chev = (
  <svg className="menu-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 6l6 6-6 6" />
  </svg>
)

function icon(children) {
  return (
    <svg className="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

export const ICONS = {
  refresh: icon(<><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></>),
  clock: icon(<><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></>),
  link: icon(<><path d="M14 3h7v7" /><path d="M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></>),
  appear: icon(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></>),
  spark: icon(<path d="M12 3l1.8 4.9L19 9l-4.9 1.8L12 16l-1.8-5.3L5 9l5.2-1.1z" />),
  key: icon(<><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8 2 2M18 6l2 2" /></>),
  info: icon(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>),
  code: icon(<><path d="M8 9l-4 3 4 3M16 9l4 3-4 3" /></>),
  heart: icon(<path d="M12 21s-7-4.5-9.5-8.5A5 5 0 0 1 12 6a5 5 0 0 1 9.5 6.5C19 16.5 12 21 12 21z" />),
  layers: icon(<><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></>),
  play: icon(<><circle cx="12" cy="12" r="9" /><path d="M10 8.5v7l6-3.5z" fill="currentColor" stroke="none" /></>),
  check: icon(<><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>),
  xcircle: icon(<><circle cx="12" cy="12" r="9" /><path d="m15 9-6 6M9 9l6 6" /></>),
  star: icon(<path d="m12 3 2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.9 6.7 19.5l1.1-6L3.4 9.3l6-.8z" />),
  nav: icon(
    <>
      <rect x="3" y="7" width="18" height="10" rx="3" />
      <circle cx="8" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
}

export function MenuItem({ glyph, label, sub, value, valueAccent, href, onClick, disabled, chevron = true }) {
  const body = (
    <>
      {glyph}
      <span className="menu-label">
        {label}
        {sub ? <span className="menu-sub">{sub}</span> : null}
      </span>
      {value ? <span className={`menu-value${valueAccent ? ' accent' : ''}`}>{value}</span> : null}
      {chevron && !disabled ? chev : null}
    </>
  )
  if (href) {
    return (
      <a className="menu-item" href={href} target="_blank" rel="noreferrer">
        {body}
      </a>
    )
  }
  return (
    <button type="button" className="menu-item" onClick={onClick} disabled={disabled}>
      {body}
    </button>
  )
}
