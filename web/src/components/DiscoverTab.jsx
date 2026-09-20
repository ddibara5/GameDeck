import DiscoverBrowse from './DiscoverBrowse.jsx'
import './discover.css'

// Discover is the catalog. Personalized picks open from the Home For You tile.
export default function DiscoverTab({ onCustomize, onAsk }) {
  return (
    <div className="discover-page discover-page-standalone">
      <div className="discover-base">
        <DiscoverBrowse onCustomize={onCustomize} onAsk={onAsk} />
      </div>
    </div>
  )
}
