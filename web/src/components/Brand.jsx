// GameDeck brand lockup in the app header. Doubles as the button that opens the
// directory drawer, so it carries a small caret affordance to signal it is tappable.
const MARK = (
  <svg className="brand-mark gd-logo" viewBox="130 105 252 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <polygon className="l2" points="138,306 256,365 256,399 138,340" fill="#792d08" />
    <polygon className="l1" points="374,306 256,365 256,399 374,340" fill="#5c2206" />
    <polygon className="l3" points="256,247 374,306 256,365 138,306" fill="#9a3b0c" />
    <polygon className="l3" points="138,239 256,298 256,332 138,273" fill="#9a3b0c" />
    <polygon className="l2" points="374,239 256,298 256,332 374,273" fill="#792d08" />
    <polygon className="l5" points="256,180 374,239 256,298 138,239" fill="#c85c15" />
    <polygon className="l6" points="138,172 256,231 256,265 138,206" fill="#d97716" />
    <polygon className="l4" points="374,172 256,231 256,265 374,206" fill="#b4590f" />
    <polygon className="l7" points="256,113 374,172 256,231 138,172" fill="#f5a623" />
  </svg>
)

const CARET = (
  <svg className="brand-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
)

/**
 * The lockup, and the app header's only control.
 *
 * With a `label` it becomes the screen's title as well: the mark, the tab name
 * and the caret on one line, which is what lets the header and the large title
 * be one row instead of two. The button's accessible name is then the tab name
 * rather than "Open menu", ON PURPOSE - App.jsx wraps this in the page's <h1>,
 * and an aria-label on a descendant replaces the subtree, so labelling it "Open
 * menu" would make the heading read "Open menu". `aria-haspopup` still says what
 * it does. Without a label it is the plain wordmark, which is what the overlays
 * that print their own heading get.
 */
export default function Brand({ onOpen, label }) {
  const content = (
    <>
      {MARK}
      {label ? (
        <span className="brand-title">{label}</span>
      ) : (
        <span className="brand-word">
          Game<b>Deck</b>
        </span>
      )}
      {onOpen ? CARET : null}
    </>
  )

  if (!onOpen) return <div className="brand-btn brand-static">{content}</div>

  return (
    <button
      type="button"
      className="brand-btn"
      onClick={onOpen}
      aria-label={label ? undefined : 'Open menu'}
      aria-haspopup="menu"
    >
      {content}
    </button>
  )
}
