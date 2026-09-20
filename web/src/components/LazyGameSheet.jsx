import { lazy, Suspense } from 'react'

const loadGameSheet = () => import('./GameSheet.jsx')
const GameSheet = lazy(loadGameSheet)

export function preloadGameSheet() {
  return loadGameSheet()
}

function GameSheetFallback() {
  return (
    <div className="game-sheet-fallback" role="status" aria-live="polite">
      <span className="chunk-fallback-line skeleton" aria-hidden="true" />
      <span>Opening game…</span>
    </div>
  )
}

export default function LazyGameSheet(props) {
  return (
    <Suspense fallback={<GameSheetFallback />}>
      <GameSheet {...props} />
    </Suspense>
  )
}
