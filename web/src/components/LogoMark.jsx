// The shared GameDeck mark. Both treatments use the same geometry and the same
// --logo-1..7 palette, so changing the color theme recolors either one without
// maintaining a separate image for every accent.
export default function LogoMark({ className = '', variant }) {
  const force = variant ? ` logo-force-${variant}` : ''

  return (
    <svg
      className={`gd-logo${force}${className ? ` ${className}` : ''}`}
      viewBox="130 105 252 300"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g className="logo-classic">
        <polygon className="l2" points="138,306 256,365 256,399 138,340" />
        <polygon className="l1" points="374,306 256,365 256,399 374,340" />
        <polygon className="l3" points="256,247 374,306 256,365 138,306" />
        <polygon className="l3" points="138,239 256,298 256,332 138,273" />
        <polygon className="l2" points="374,239 256,298 256,332 374,273" />
        <polygon className="l5" points="256,180 374,239 256,298 138,239" />
        <polygon className="l6" points="138,172 256,231 256,265 138,206" />
        <polygon className="l4" points="374,172 256,231 256,265 374,206" />
        <polygon className="l7" points="256,113 374,172 256,231 138,172" />
      </g>

      <g className="logo-glass">
        <g className="glass-shadow">
          <polygon className="glass-top glass-bottom" points="256,247 374,306 256,365 138,306" />
          <polygon className="glass-side glass-left l2" points="138,306 256,365 256,399 138,340" />
          <polygon className="glass-side glass-right l1" points="374,306 256,365 256,399 374,340" />

          <polygon className="glass-top glass-middle" points="256,180 374,239 256,298 138,239" />
          <polygon className="glass-side glass-left l3" points="138,239 256,298 256,332 138,273" />
          <polygon className="glass-side glass-right l2" points="374,239 256,298 256,332 374,273" />

          <polygon className="glass-top glass-peak" points="256,113 374,172 256,231 138,172" />
          <polygon className="glass-side glass-left l6" points="138,172 256,231 256,265 138,206" />
          <polygon className="glass-side glass-right l4" points="374,172 256,231 256,265 374,206" />
        </g>

        {/* Fine inset rims create the glass edge without changing the silhouette
            or making the small header mark visually heavier than Classic. */}
        <polyline className="glass-rim glass-rim-peak" points="151,172 256,120 361,172" />
        <polyline className="glass-rim" points="151,239 256,187 361,239" />
        <polyline className="glass-rim" points="151,306 256,254 361,306" />
        <path className="glass-glint" d="M139 172 256 231 374 172" />
      </g>
    </svg>
  )
}
