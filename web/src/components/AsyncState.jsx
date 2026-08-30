import Skeleton from './Skeleton.jsx'

export function LoadingState({ label = 'Loading…', count = 5 }) {
  return (
    <div className="async-state" role="status" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}</span>
      <Skeleton count={count} />
    </div>
  )
}

export function MessageState({ title, children, error = false }) {
  return (
    <div className="empty-state" role={error ? 'alert' : 'status'}>
      <div className="empty-state-title">{title}</div>
      {children ? <div>{children}</div> : null}
    </div>
  )
}
