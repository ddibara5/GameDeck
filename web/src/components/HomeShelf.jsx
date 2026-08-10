import Cover from './Cover.jsx'
import { minutesToHhm, igdbCover } from '../lib/format.js'
import { useStatusMap, effectiveStatus, includeInLists } from '../lib/userStatus.js'

// Discovery shelf shown at the top of the Library (default view only): "Continue
// playing". Uses the same signal as the Playing list (real games whose effective
// status is "playing", i.e. played within the recency window and not finished),
// most-recent first, so the shelf and the side-panel list stay in sync.
export default function HomeShelf({ games, onSelect }) {
  const statusMap = useStatusMap()
  const continuePlaying = games
    .filter((g) => includeInLists(g, statusMap) && effectiveStatus(g, statusMap) === 'playing')
    .sort((a, b) => new Date(b.last_played || 0) - new Date(a.last_played || 0))
    .slice(0, 12)

  const shelves = [
    {
      key: 'continue',
      label: 'Continue playing',
      items: continuePlaying,
      meta: (g) => minutesToHhm(g.playtime_minutes) + ' played',
    },
  ]

  return (
    <>
      {shelves.map((s) =>
        s.items.length ? (
          <section className="shelf" key={s.key}>
            <div className="shelf-head">
              <span className="shelf-title">{s.label}</span>
            </div>
            <div className="shelf-row">
              {s.items.map((g) => (
                <button
                  type="button"
                  className="shelf-card"
                  key={g.master_id}
                  onClick={() => onSelect(g)}
                >
                  <div className="shelf-poster">
                    <Cover
                      src={
                        g.cover_igdb
                          ? igdbCover(g.cover_igdb, 't_cover_big')
                          : g.cover_tile || g.cover_standard || g.cover_small
                      }
                      title={g.title}
                      size="lg"
                    />
                  </div>
                  <div className="shelf-card-title">{g.title}</div>
                  <div className="shelf-card-meta">{s.meta(g)}</div>
                </button>
              ))}
            </div>
          </section>
        ) : null
      )}
    </>
  )
}
