/**
 * A single shimmering skeleton card, used while the library/activity data
 * is loading. Render several in a row for a list placeholder.
 */
export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton skeleton-cover" />
      <div className="skeleton-lines">
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line short" />
        <div className="skeleton skeleton-line" style={{ height: 6 }} />
      </div>
    </div>
  )
}

export default function Skeleton({ count = 6 }) {
  return (
    <div className="game-list">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
