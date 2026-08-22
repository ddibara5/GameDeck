/**
 * Same-origin passthrough for one small IGDB cover, so the client can read its
 * pixels.
 *
 * The game sheet paints itself in a colour sampled from the game's cover. That
 * sampling is a canvas read, and a canvas read of a cross-origin image is only
 * allowed when the image host sends Access-Control-Allow-Origin. Neither
 * images.igdb.com nor the wsrv.nl CDN in front of it documents that header, and
 * it is not something to find out from production: if it is absent the image
 * fails to load under crossOrigin="anonymous" and the feature silently does
 * nothing. Serving the same bytes from this origin removes the question.
 *
 * NOT an open proxy. It takes an IGDB image id, not a URL, and builds the
 * upstream address itself, so there is no host a caller can point it at. The id
 * is the same opaque token already stored in games.cover_igdb.
 *
 * t_cover_small is 90px wide, which is more than an 8x8 average needs, and it is
 * about 3KB. Cached immutably: an IGDB image id names one fixed image forever,
 * so this should be one origin request per cover for the life of the edge cache.
 */

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const UPSTREAM = (id) => `https://images.igdb.com/igdb/image/upload/t_cover_small/${id}.jpg`;

export default async function handler(req, res) {
  const id = String((req.query && req.query.id) || '');
  if (!ID.test(id)) {
    res.status(400).json({ error: 'bad id' });
    return;
  }
  try {
    const upstream = await fetch(UPSTREAM(id));
    if (!upstream.ok) {
      // Do not cache a miss: a cover can be added to IGDB later.
      res.setHeader('Cache-Control', 'no-store');
      res.status(upstream.status).json({ error: 'upstream' });
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    res.status(200).send(buf);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'fetch failed' });
  }
}
