import { TAB_ICONS } from './TabBar.jsx'

// One icon per drawer destination, shared by the drawer and its editor so the
// two can never drift. Tabs reuse the bar's icons; the rest are defined here.
// Raw elements, no className: callers clone them with whichever class their
// surface uses (.menu-icon in the drawer, .cz-tab-icon in the editor).
function icon(children) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

export const DEST_ICONS = {
  ...TAB_ICONS,
  search: icon(<><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>),
  wishlist: icon(<path d="M12 21s-7-4.5-9.5-8.5A5 5 0 0 1 12 6a5 5 0 0 1 9.5 6.5C19 16.5 12 21 12 21z" />),
  backlog: icon(
    <>
      <path d="M12 2 2 7l10 5 10-5-10-5z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </>
  ),
  playing: icon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l6-3.5z" fill="currentColor" stroke="none" />
    </>
  ),
  finished: icon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  shuffle: icon(
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <circle cx="8.4" cy="8.4" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="15.6" cy="15.6" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="8.4" cy="15.6" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="15.6" cy="8.4" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.05" fill="currentColor" stroke="none" />
    </>
  ),
  settings: icon(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.9 14.6a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </>
  ),
}
