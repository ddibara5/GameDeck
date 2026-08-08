/**
 * Compact horizontal progress bar for a 0-100 completion percentage.
 */
export default function CompletionBar({ percent = 0 }) {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0))

  return (
    <div
      className="completion-bar-track"
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="completion-bar-fill" style={{ width: `${clamped}%` }} />
    </div>
  )
}
