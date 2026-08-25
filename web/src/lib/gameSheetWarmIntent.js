// Keep card/list bundles lean. The metadata and image pipeline is loaded only
// when the user shows intent to open a sheet (or when GameSheet itself loads).
let warmer = null

function warmGameSheetIntent(game, variant) {
  if (!game) return
  if (!warmer) warmer = import('./gameSheetWarm.js')
  warmer.then(({ warmGameSheet }) => warmGameSheet(game, variant)).catch(() => {})
}

export function gameSheetWarmProps(game, variant) {
  if (!game) return {}
  const warm = () => warmGameSheetIntent(game, variant)
  return { onPointerEnter: warm, onPointerDown: warm, onFocus: warm }
}
