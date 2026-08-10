import Cover from './Cover.jsx'
import { minutesToHhm, igdbCover } from '../lib/format.js'

// Discovery shelf shown at the top of the Library (default view only): "Continue
// playing" (most recently played). The backlog now lives only in the side panel.
export default function HomeShelf({ games, onSelect }) {
  const continuePlaying = games.filter((g) => g.last_played).slice(0, 12)

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
