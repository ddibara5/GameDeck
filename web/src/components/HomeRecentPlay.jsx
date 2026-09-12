import { NowPlayingChevron } from './HomeNowPlaying.jsx'
import { minutesToHhm } from '../lib/format.js'

// Port of the pilot's RecentPlayCard (home-cards.tsx): the 7-day totals plus
// the 7-day bar strip. The whole card is a button into Insights.

function weekdayNarrow(key) {
  return new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })
}

const plural = (n, one, many) => (n === 1 ? one : many)

export default function HomeRecentPlay({ snapshot, onOpen }) {
  const highest = Math.max(1, ...snapshot.days.map((day) => day.minutes))

  return (
    <section className="hm-card" aria-label="Recent play">
      <button
        type="button"
        className="hm-rp"
        onClick={onOpen}
        aria-label={`Last seven days: ${minutesToHhm(snapshot.minutes)} played, ${snapshot.gameCount} games, ${snapshot.achievements} achievements, ${snapshot.activeDays} active days. Open Insights.`}
      >
        <span className="hm-rp-head">
          <span className="hm-rp-title">Last 7 days</span>
          <NowPlayingChevron />
        </span>
        <span className="hm-rp-main">
          <span className="hm-rp-stats">
            <span className="hm-rp-hero">{minutesToHhm(snapshot.minutes)}</span>
            <span className="hm-muted">
              {snapshot.gameCount} {plural(snapshot.gameCount, 'game', 'games')} · {snapshot.activeDays} active{' '}
              {plural(snapshot.activeDays, 'day', 'days')}
            </span>
            <span className="hm-muted">
              {snapshot.achievements} {plural(snapshot.achievements, 'achievement', 'achievements')}
            </span>
          </span>
          {/* aria-hidden: the button's own label already says the totals, and
              seven unlabelled bars are noise rather than information. */}
          <span className="hm-rp-strip" aria-hidden="true">
            <span className="hm-rp-rule" style={{ top: 36 }} />
            <span className="hm-rp-rule" style={{ top: 72 }} />
            <span className="hm-rp-cols">
              {snapshot.days.map((day) => (
                <span key={day.key} className="hm-rp-col">
                  <span className="hm-rp-barwrap">
                    <span
                      className={`hm-rp-bar${day.minutes > 0 ? '' : ' zero'}`}
                      style={day.minutes > 0 ? { height: Math.max(3, (day.minutes / highest) * 72) } : undefined}
                    />
                  </span>
                  <span className="hm-rp-day">{weekdayNarrow(day.key)}</span>
                </span>
              ))}
            </span>
          </span>
        </span>
      </button>
    </section>
  )
}
