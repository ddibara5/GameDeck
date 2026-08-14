// Release timing, drawn on the cover instead of under the title.
//
// The figure carries the meaning, so it is the big element and the unit is the
// caption - the same treatment the wishlist Next up cards use. Moving it off the
// meta line leaves that line as just the rating, which is the "simplify" half of
// this: a card now says one thing under the title, not three.
//
// Returns null rather than an empty scrim when there is no timing, so a game with
// no release date (or one over a year old, where releaseTiming gives up) keeps a
// clean cover.
export default function TimingOverlay({ parts }) {
  if (!parts) return null
  return (
    <span className={`sc-ov ${parts.tone}`}>
      <span className="sc-ov-big">{parts.big}</span>
      {/* Always rendered, even empty ("Today" has no unit): the caption reserves
          its line in CSS so every figure in a row shares one baseline. Held open
          with min-height rather than a non-breaking space, which keeps this file
          pure ASCII. */}
      <span className="sc-ov-lab">{parts.lab}</span>
    </span>
  )
}
