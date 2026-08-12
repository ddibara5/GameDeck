import { TAB_BY_KEY } from '../lib/navConfig.js'

// Per-tab line icons. Labels live in navConfig (TAB_META) so the editor and the
// drawer's "More" list share one source of truth; the drawer also renders these
// same icons for any hidden tab.
export const TAB_ICONS = {
  library: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="4" width="7" height="16" rx="1.5" />
      <rect x="13.5" y="4" width="7" height="16" rx="1.5" />
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v4.8l3.2 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  insights: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 20h18" strokeLinecap="round" />
      <path d="M6.5 20v-6M12 20v-11M17.5 20v-8" strokeLinecap="round" />
    </svg>
  ),
  discover: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3.5l1.8 4.2 4.2 1.8-4.2 1.8L12 15.5l-1.8-4.2-4.2-1.8 4.2-1.8L12 3.5z" strokeLinejoin="round" />
      <path d="M18.5 15l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9z" strokeLinejoin="round" />
    </svg>
  ),
  news: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 5.5h11a1 1 0 0 1 1 1V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 9h3a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 9h6M6.5 12h6M6.5 15h4" strokeLinecap="round" />
    </svg>
  ),
}

export default function TabBar({ tabs, active, onChange, badges, showLabels = true }) {
  return (
    <nav className={`tabbar${showLabels ? '' : ' icons-only'}`} aria-label="Main navigation">
      {tabs.map((tab) => {
        const meta = TAB_BY_KEY[tab]
        if (!meta) return null
        const isActive = tab === active
        const hasBadge = badges && badges[tab] && !isActive
        return (
          <button
            key={tab}
            type="button"
            className={`tabbar-btn${isActive ? ' active' : ''}`}
            onClick={() => onChange(tab)}
            aria-current={isActive ? 'page' : undefined}
            aria-label={showLabels ? undefined : meta.label}
          >
            {hasBadge ? <span className="tab-unread" aria-label="New" /> : null}
            <span className="tabbar-icon">{TAB_ICONS[tab]}</span>
            {showLabels ? <span>{meta.label}</span> : null}
          </button>
        )
      })}
    </nav>
  )
}
