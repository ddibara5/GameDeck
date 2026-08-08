// GameDeck brand lockup for the app header: the stacked-tiles mark + wordmark.
// Mark is transparent-background so it sits on any header color.
export default function Brand() {
  return (
    <div className="brand" aria-label="GameDeck">
      <svg className="brand-mark" viewBox="130 105 252 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <polygon points="138,306 256,365 256,399 138,340" fill="#792d08" />
        <polygon points="374,306 256,365 256,399 374,340" fill="#5c2206" />
        <polygon points="256,247 374,306 256,365 138,306" fill="#9a3b0c" />
        <polygon points="138,239 256,298 256,332 138,273" fill="#9a3b0c" />
        <polygon points="374,239 256,298 256,332 374,273" fill="#792d08" />
        <polygon points="256,180 374,239 256,298 138,239" fill="#c85c15" />
        <polygon points="138,172 256,231 256,265 138,206" fill="#d97716" />
        <polygon points="374,172 256,231 256,265 374,206" fill="#b4590f" />
        <polygon points="256,113 374,172 256,231 138,172" fill="#f5a623" />
      </svg>
      <span className="brand-word">Game<b>Deck</b></span>
    </div>
  )
}
