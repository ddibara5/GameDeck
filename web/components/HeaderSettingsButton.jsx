import './headerSettingsButton.css'

// Port of the Expo pilot's HeaderSettingsButton (Sept 10 commit). A 44px gear
// button that opens Settings. The pilot pushed the `/more/settings` route; the
// PWA opens Settings through the `onOpenSettings` action (Menu/SettingsPage),
// so the destination is a prop, not a route.
export default function HeaderSettingsButton({ onOpenSettings, label = 'Settings' }) {
  return (
    <button
      type="button"
      className="hsb"
      aria-label={label}
      title={label}
      onClick={onOpenSettings}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3.2" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.89a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09A1.7 1.7 0 0 0 10.11 3V3a2 2 0 1 1 4 0v.09c0 .68.4 1.3 1.01 1.55.61.26 1.32.11 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09c.26.61.88 1.01 1.55 1.01H21a2 2 0 1 1 0 4h-.09c-.68 0-1.3.4-1.51 1.01Z" />
      </svg>
    </button>
  )
}
