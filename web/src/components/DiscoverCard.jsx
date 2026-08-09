import Cover from './Cover.jsx'

// A single Discover catalog result. Mirrors the Library GameCard layout so the
// two grids feel like one app, but is fed by IGDB data (name/cover/year/rating).
export default function DiscoverCard({ game, inLibrary, onSelect }) {
  const genre = game.genres && game.genres.length ? game.genres[0] : null
  const platforms = (game.platforms || []).slice(0, 3).join(' · ')

  return (
    <button type="button" className="game-card discover-card" onClick={() => onSelect(game)}>
      <Cover src={game.cover} title={game.name} size="sm" />
      <div className="game-card-body">
        <div className="game-title">{game.name}</div>
        <div className="discover-card-tags">
          {game.year ? <span>{game.year}</span> : null}
          {genre ? <span>· {genre}</span> : null}
        </div>
        <div className="game-meta-row">
          {game.rating ? <span className="discover-rating">★ {game.rating}</span> : <span>Unrated</span>}
          {platforms ? <span>· {platforms}</span> : null}
        </div>
        {inLibrary ? <span className="in-library-badge">In library</span> : null}
      </div>
    </button>
  )
}
