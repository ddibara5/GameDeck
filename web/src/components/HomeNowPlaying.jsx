import Cover from './Cover.jsx'
import { minutesToHhm } from '../lib/format.js'

// Port of the pilot's NowPlayingCard (home-cards.tsx): the most recently played
// game, its story/achievement progress, and this-week vs lifetime playtime.
// Not tappable when there is no game to open, like the pilot's disabled pressable.

export function NowPlayingChevron() {
  return (
    <svg className="hm-chev" viewBox="0 0 10 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 2.5 8 8l-4.5 5.5" />
    </svg>
  )
}

export default function HomeNowPlaying({ play, onOpen }) {
  const item = play?.item ?? null
  const progress = item?.progress
  const showProgress = typeof progress === 'number' && Number.isFinite(progress)
  const weekly = play?.weeklyMinutes ?? null
  const total = play?.totalMinutes ?? null
  const showPlaytime = weekly !== null || total !== null
  const tappable = Boolean(onOpen)

  const playtime = [
    weekly !== null ? `${minutesToHhm(weekly)} this week` : null,
    total !== null ? `${minutesToHhm(total)} total` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <section className="hm-card" aria-label="Now playing">
      <button
        type="button"
        className="hm-np"
        disabled={!tappable}
        onClick={tappable ? onOpen : undefined}
        aria-label={
          item
            ? `${item.title}. Progress: ${showProgress ? `${Math.round(progress)} percent` : 'unknown'}. Open details.`
            : undefined
        }
      >
        <Cover src={item?.artwork ?? null} title={item?.title} size="sm" className="hm-cov-np" priority />
        <span className="hm-np-body">
          <span className="hm-eyebrow">NOW PLAYING</span>
          <span className="hm-np-title">{item?.title ?? 'Your next session starts here'}</span>
          <span className="hm-muted">{item?.environment ?? 'Your recent games will appear here'}</span>
          {item && showProgress ? (
            <span>
              <span className="hm-track" aria-hidden="true">
                <span className="hm-fill" style={{ width: `${progress}%` }} />
              </span>
              <span className="hm-muted">
                {Math.round(progress)}% · {item.progressLabel === 'Story progress' ? 'Story estimate' : 'Achievements'}
              </span>
            </span>
          ) : null}
          {item && showPlaytime ? <span className="hm-muted hm-playtime">{playtime}</span> : null}
        </span>
        {tappable ? <NowPlayingChevron /> : null}
      </button>
    </section>
  )
}
