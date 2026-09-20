import { TAB_BY_KEY } from '../lib/navConfig.js'

// Per-tab line icons. Labels live in navConfig (TAB_META) so the bar and the
// bar editor share one source of truth.
// Icon language follows the Expo pilot's tab-destinations symbols: safari
// (compass) for Discover, waveform.path.ecg for Activity, books.vertical for
// Library, chart.bar for Insights, list.number for Rankings, newspaper for
// News. Ask stays the detached search utility, matching the pilot's Search
// action rather than a tab.
export const TAB_ICONS = {
  // HomeDeck's house, copied path for path from its `Qt.home` so the two apps
  // open on the same mark. Ours was a roofline over an open-bottomed box: no
  // floor, no door, and the walls ran to the edge of the viewBox. Theirs closes
  // the walls with rounded corners and puts a door in, which is the thing that
  // reads as a HOUSE rather than as an arrow over a bracket at 22px.
  // linecap/linejoin sit on the svg here, as they do there, because all three
  // paths want the same treatment.
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.4 10.4 12 3.6l8.6 6.8" />
      <path d="M5.4 9.4v9.2a1.8 1.8 0 0 0 1.8 1.8h9.6a1.8 1.8 0 0 0 1.8-1.8V9.4" />
      <path d="M9.8 20.4v-5.2h4.4v5.2" />
    </svg>
  ),
  library: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="4" width="7" height="16" rx="1.5" />
      <rect x="13.5" y="4" width="7" height="16" rx="1.5" />
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l2.5-6 4 12 2.5-8 1.5 2H21" />
    </svg>
  ),
  insights: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 20h18" strokeLinecap="round" />
      <path d="M6.5 20v-6M12 20v-11M17.5 20v-8" strokeLinecap="round" />
    </svg>
  ),
  discover: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </svg>
  ),
  foryou: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6.5" y="3.5" width="13" height="17" rx="2" />
      <path d="M6.5 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h8" />
      <path d="m13 8.2.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8.8-1.8z" />
    </svg>
  ),
  news: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 5.5h11a1 1 0 0 1 1 1V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 9h3a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 9h6M6.5 12h6M6.5 15h4" strokeLinecap="round" />
    </svg>
  ),
  rankings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 20V10h4v10M10 20V5h4v15M15 20v-7h4v7" />
      <path d="M3 20h18" />
    </svg>
  ),
}

export default function TabBar({ tabs, active, onChange, onWarm, onSearch, badges, showLabels = true, searchOnly = false }) {
  const activeIndex = tabs.indexOf(active)
  // The detached search utility owns a fixed 62px touch target. Six destination
  // labels beside it would squeeze below a useful reading width on a 390px
  // phone, so only that maximum-density configuration switches to icons. The
  // user's tab order and membership remain untouched.
  const renderLabels = showLabels && tabs.length < 6

  return (
    <div className={`app-dock${searchOnly ? ' dock-search-only' : ''}`}>
      {/* searchOnly is the hidden-bar state: the strip is gone but Search stays
          reachable as the same floating button, bottom-right where it always
          is. Nothing else on the bar needs a fallback, because every bar tab is
          also reachable from the remaining entry points (see navConfig). */}
      {searchOnly ? null : (
      <nav
        className={`tabbar${renderLabels ? '' : ' icons-only'}${activeIndex >= 0 ? ' has-active' : ''}`}
        aria-label="Main navigation"
        style={{ '--tab-count': Math.max(1, tabs.length), '--active-index': Math.max(0, activeIndex) }}
      >
        <span className="tabbar-lens" aria-hidden="true" />
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
              onPointerDown={() => onWarm && onWarm(tab)}
              onFocus={() => onWarm && onWarm(tab)}
              onClick={() => onChange(tab)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={renderLabels ? undefined : meta.label}
            >
              {hasBadge ? <span className="tab-unread" aria-label="New" /> : null}
              <span className="tabbar-icon">{TAB_ICONS[tab]}</span>
              {renderLabels ? <span>{meta.label}</span> : null}
            </button>
          )
        })}
      </nav>
      )}
      <button type="button" className="global-search-trigger" aria-label="Search GameDeck" onClick={onSearch}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.5 15.5 5 5" />
        </svg>
      </button>
    </div>
  )
}
