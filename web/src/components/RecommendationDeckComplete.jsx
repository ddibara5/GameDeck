export default function RecommendationDeckComplete({ batchSize, loading, onContinue, onSurprise, onBrowse }) {
  return (
    <div className="fy-deck-complete">
      <span className="fy-deck-complete-mark" aria-hidden="true">✓</span>
      <h2>You’re caught up</h2>
      <p>You’ve seen this batch of {batchSize} recommendations. Continue when you want a few more.</p>
      <button type="button" className="fy-deck-complete-primary" onClick={onContinue} disabled={loading}>
        {loading ? 'Finding six more…' : 'Keep exploring'}
      </button>
      <div className="fy-deck-complete-secondary">
        <button type="button" onClick={onSurprise}>Surprise me</button>
        <button type="button" onClick={onBrowse}>Browse games</button>
      </div>
    </div>
  )
}

