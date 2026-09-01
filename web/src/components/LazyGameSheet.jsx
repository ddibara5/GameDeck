import { lazy, Suspense } from 'react'

const loadGameSheet = () => import('./GameSheet.jsx')
const GameSheet = lazy(loadGameSheet)

export function preloadGameSheet() {
  return loadGameSheet()
}

export default function LazyGameSheet(props) {
  return (
    <Suspense fallback={null}>
      <GameSheet {...props} />
    </Suspense>
  )
}
