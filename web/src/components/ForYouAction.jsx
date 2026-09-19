import './forYou.css'

// Pill button for the For You surfaces, ported from the pilot's
// for-you-action.tsx. Variants: primary (filled), plain (text), compact.
export default function ForYouAction({
  label,
  onPress,
  primary = false,
  plain = false,
  compact = false,
  disabled = false,
  busy = false,
  accessibilityLabel,
  type = 'button',
}) {
  const className = [
    'fy-action',
    primary ? 'primary' : '',
    plain ? 'plain' : '',
    compact ? 'compact' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button
      type={type}
      className={className}
      aria-label={accessibilityLabel ?? label}
      aria-disabled={disabled || busy}
      aria-busy={busy}
      disabled={disabled || busy}
      onClick={onPress}
    >
      {busy ? (
        <span className="fy-action-spinner" aria-hidden="true" />
      ) : (
        label
      )}
    </button>
  )
}
