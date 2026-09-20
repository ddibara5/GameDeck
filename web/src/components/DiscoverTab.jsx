import { DiscoverHub } from './FeatureHub.jsx'
import './discover.css'

export default function DiscoverTab({
  onCustomize,
  onAsk,
  onOpenTaste,
  onTuneTaste,
  onOpenRankings,
}) {
  return (
    <div className="discover-page discover-page-standalone">
      <div className="discover-base">
        <DiscoverHub
          onCustomize={onCustomize}
          onAsk={onAsk}
          onOpenTaste={onOpenTaste}
          onTuneTaste={onTuneTaste}
          onOpenRankings={onOpenRankings}
        />
      </div>
    </div>
  )
}
