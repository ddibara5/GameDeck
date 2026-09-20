import LogoMark from './LogoMark.jsx'

// GameDeck brand lockup in the app header. It used to open the directory
// drawer, which is gone now; the wordmark is static, and the heading's
// accessible name comes from the tab label. With a `label` it becomes the
// screen's title as well, which is what lets the header and the large title be
// one row instead of two. Without a label it is the plain wordmark, which is
// what the overlays that print their own heading get.
export default function Brand({ label }) {
  return (
    <div className="brand-btn brand-static">
      <LogoMark className="brand-mark" />
      {label ? (
        <span className="brand-title">{label}</span>
      ) : (
        <span className="brand-word">
          Game<b>Deck</b>
        </span>
      )}
    </div>
  )
}
