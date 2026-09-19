import Cover from './Cover.jsx'
import './gameDetailHeader.css'

// Port of the Expo pilot's GameDetailHeader (Sept 10 commit). A compact detail
// header: cover art, an eyebrow context line ("From your Wishlist", a deck
// section, ...), the game title, and caller-supplied rows underneath.
export default function GameDetailHeader({ title, artwork, context, children }) {
  return (
    <div className="gdh">
      <div className="gdh-art">
        <Cover src={artwork} title={`${title} cover art`} size="sm" priority />
      </div>
      <div className="gdh-meta">
        <p className="gdh-context">{context}</p>
        <h2 className="gdh-title">{title}</h2>
        {children}
      </div>
    </div>
  )
}
