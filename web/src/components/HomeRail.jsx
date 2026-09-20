import Cover from './Cover.jsx'
import { NowPlayingChevron } from './HomeNowPlaying.jsx'
import TimingOverlay from './TimingOverlay.jsx'
import './homeRails.css'

// Web port of the pilot's HomeGameRail (home-cards.tsx, Sept 11 commit): one
// horizontal rail behind the pilot's PlayingRail and WishlistRail. The caller
// normalizes its items:
//
//   { key, title, artwork, progress, meta, source }
//
// progress is a 0-100 number (or null) drawn as the badge on the poster's
// bottom-left corner; meta is the line under the title ("8 days ago", "In 5
// days"); onOpen receives the item's `source` (the library game or wishlist
// row) so the caller can open its sheet.

export default function HomeRail({ title, items, onOpenAll, onOpen, compact = false }) {
  if (!items || items.length === 0) return null

  return (
    <section className={`hrail${compact ? ' hrail-compact' : ''}`} aria-label={title}>
      <button
        type="button"
        className="hrail-head"
        onClick={onOpenAll}
        aria-label={`See all ${String(title).toLowerCase()}`}
      >
        <span className="hrail-title">{title}</span>
        <span className="hrail-count" aria-hidden="true">
          {items.length}
        </span>
        <NowPlayingChevron />
      </button>
      <div className="hrail-strip">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className="hrail-card"
            onClick={() => onOpen(item.source)}
            aria-label={`${item.title}${item.progress != null ? `, ${item.progress}% complete` : ''}`}
          >
            <span className="hrail-poster">
              <Cover src={item.artwork} title={item.title} size="sm" className="hrail-cov" />
              {item.timing ? <TimingOverlay parts={item.timing} compact /> : null}
              {item.progress != null ? (
                <span className="hrail-badge" aria-hidden="true">
                  {item.progress}%
                </span>
              ) : null}
            </span>
            <span className="hrail-name">{item.title}</span>
            {item.meta ? <span className="hm-muted hrail-meta">{item.meta}</span> : null}
          </button>
        ))}
      </div>
    </section>
  )
}
