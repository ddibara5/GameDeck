import Cover from './Cover.jsx'
import { effectiveStatus, STATUS_LABELS } from '../lib/userStatus.js'
import { libraryCover, platformMeta } from '../lib/format.js'
import { libraryMetadata, libraryProgress } from '../lib/libraryPresentation.js'
import { versionPlatformLabel } from '../lib/gameGroups.js'
import { preloadGameSheet } from './LazyGameSheet.jsx'

export default function LibraryGameCard({ game, statusMap, onSelect, view, priority }) {
  const status = effectiveStatus(game, statusMap)
  const statusLabel = STATUS_LABELS[status] || (status === 'abandoned' ? 'Abandoned' : status)
  // Grouped games span several consoles, e.g. "Xbox 360 · Xbox One".
  const platform = game.versions
    ? versionPlatformLabel(game) || platformMeta(game.environment).label
    : game.platforms?.[0] || platformMeta(game.environment).label
  const metadata = libraryMetadata(game)
  const progress = Math.round(libraryProgress(game))

  return (
    <button
      type="button"
      className={`gd-library-card gd-library-card--${view}`}
      onPointerDown={preloadGameSheet}
      onFocus={preloadGameSheet}
      onClick={() => onSelect(game)}
      aria-label={`${game.title}, ${platform}, ${statusLabel}, ${metadata}`}
    >
      {view !== 'list' && (
        <Cover src={libraryCover(game)} title={game.title} priority={priority} sizes={view === 'grid' ? '(max-width: 640px) 45vw, 296px' : '64px'} />
      )}
      <span className="gd-library-card-body">
        <span className="gd-library-title">{game.title}</span>
        <span className="gd-library-platform">{platform} · <span className="gd-library-status">{statusLabel}</span></span>
        {Number(game.length_minutes) > 0 && (
          <span className="gd-library-progress" role="progressbar" aria-label="Estimated story progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <span style={{ width: `${progress}%` }} />
          </span>
        )}
        <span className="gd-library-meta">{metadata}</span>
      </span>
      {view !== 'grid' && <svg className="gd-library-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>}
    </button>
  )
}
