import Cover from './Cover.jsx'
import { releaseLabel } from '../lib/homeReleaseWatch.js'
import { gameArtworkUrl } from '../lib/homeInsights.js'

// Port of the pilot's ReleaseWatchCard (home-cards.tsx): the next two and
// most recent two wishlist releases, side by side, with the Wishlist > header
// button. Taps open the game sheet; the caller renders the soft-failure retry
// line below the card like the pilot does.

function ReleaseRow({ item, onOpen }) {
  return (
    <button
      type="button"
      className="hm-rw-row"
      onClick={() => onOpen(item)}
      aria-label={`${item.title}, ${releaseLabel(item)}. Open details.`}
    >
      <Cover src={gameArtworkUrl(item.cover, null)} title={item.title} size="sm" className="hm-cov-rel" />
      <span className="hm-rw-copy">
        <span className="hm-rw-name">{item.title}</span>
        <span className="hm-muted">{releaseLabel(item)}</span>
      </span>
    </button>
  )
}

export default function HomeReleaseWatch({ comingUp, outNow, onOpenAll, onOpen }) {
  const empty = comingUp.length === 0 && outNow.length === 0

  return (
    <section className="hm-card hm-rw" aria-label="Release watch">
      <div className="hm-rw-head">
        <h2 className="hm-rw-title">Release watch</h2>
        <button type="button" className="hm-rw-all" onClick={onOpenAll} aria-label="See your full wishlist">
          Wishlist ›
        </button>
      </div>
      {empty ? (
        <p className="hm-rw-empty">Save games with release dates to see what’s next.</p>
      ) : (
        <div className="hm-rw-cols">
          <div className="hm-rw-col">
            <div className="hm-rw-label">Coming up</div>
            {comingUp.length > 0 ? (
              comingUp.map((item) => <ReleaseRow key={item.igdb_id} item={item} onOpen={onOpen} />)
            ) : (
              <p className="hm-muted">Nothing here yet</p>
            )}
          </div>
          <div className="hm-rw-div" aria-hidden="true" />
          <div className="hm-rw-col">
            <div className="hm-rw-label">Out now</div>
            {outNow.length > 0 ? (
              outNow.map((item) => <ReleaseRow key={item.igdb_id} item={item} onOpen={onOpen} />)
            ) : (
              <p className="hm-muted">Nothing here yet</p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
