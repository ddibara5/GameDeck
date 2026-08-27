import LogoMark from './LogoMark.jsx'

// GameDeck brand lockup in the app header. Doubles as the button that opens the
// directory drawer, so it carries a small caret affordance to signal it is tappable.

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
      <LogoMark className="brand-mark" />
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
