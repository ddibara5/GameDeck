import DiscoverBrowse from './DiscoverBrowse.jsx'
import './discover.css'

export default function DiscoverTab({ onCustomize, onAsk }) {
  return (
    <div className="discover-page discover-page-standalone">
      <div className="discover-base">
        <DiscoverBrowse onAsk={onAsk} onCustomize={onCustomize} />
      </div>
    </div>
  )
}
