import { NowPlayingChevron } from './HomeNowPlaying.jsx'

// Port of the pilot's ForYouCard (home-cards.tsx): the taste-engine entry
// point. Opens the For You tab via the caller's onOpenTab('foryou').

export default function HomeForYouCard({ onOpen }) {
  return (
    <button
      type="button"
      className="hm-fy"
      onClick={onOpen}
      aria-label="Find your next game in For You"
    >
      <svg
        className="hm-fy-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
        <path d="M20 3v4" />
        <path d="M22 5h-4" />
      </svg>
      <span className="hm-fy-body">
        <span className="hm-eyebrow">FOR YOU</span>
        <span className="hm-fy-title">Find your next game</span>
      </span>
      <NowPlayingChevron />
    </button>
  )
}
