import DiscoverForYou from './DiscoverForYou.jsx'
import './discover.css'

export default function ForYouTab({ onAsk, onBrowse }) {
  return (
    <div className="discover-page discover-page-standalone for-you-page">
      <div className="discover-base">
        <DiscoverForYou onAsk={onAsk} onBrowse={onBrowse} />
      </div>
    </div>
  )
}
