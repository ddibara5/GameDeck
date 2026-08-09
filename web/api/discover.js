// Vercel serverless function - GameDeck "Discover" catalog proxy.
// Talks to IGDB (via Twitch app credentials) so the client never sees the secret.
// Read-only game metadata; no per-request cost, so this endpoint is left ungated.
//
// Required env vars (Vercel project settings):
//   TWITCH_CLIENT_ID       - your Twitch application's Client ID
//   TWITCH_CLIENT_SECRET   - your Twitch application's Client Secret
//
// Usage (GET):
//   /api/discover?rail=popular|upcoming|recent|highly_rated
//   /api/discover?q=elden           (search)
//   /api/discover?preset=soulslike|fromsoft|rockstar|jrpg|metroidvania|arpg
//   /api/discover?genre=role-playing-rpg&platform=xbox&year=2024&sort=rating&page=0
//   add &debug=1 to see the generated IGDB query in the response

const IGDB = 'https://api.igdb.com/v4';
const IMG = (id, size) => (id ? `https://images.igdb.com/igdb/image/upload/t_${size}/${id}.jpg` : null);

// --- token cache (survives while the serverless instance stays warm) ----------
let _token = null;
let _tokenExp = 0;

async function getToken() {
  const now = Date.now();
  if (_token && now < _tokenExp - 60000) return _token;
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Missing TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET');
  const url = `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}&grant_type=client_credentials`;
  const r = await fetch(url, { method: 'POST' });
  if (!r.ok) throw new Error(`Twitch token failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  _token = j.access_token;
  _tokenExp = now + (j.expires_in || 3600) * 1000;
  return _token;
}

async function igdb(endpoint, body) {
  const token = await getToken();
  const r = await fetch(`${IGDB}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-ID': process.env.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body,
  });
  if (!r.ok) throw new Error(`IGDB ${endpoint} failed: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

// --- slug/name -> id resolution, cached per warm instance ---------------------
const _ids = {};
async function resolveKeyword(slug) {
  const k = `kw:${slug}`;
  if (k in _ids) return _ids[k];
  const rows = await igdb('keywords', `fields id; where slug = "${slug}"; limit 1;`);
  return (_ids[k] = rows[0] ? rows[0].id : null);
}
async function resolveCompany(name) {
  const k = `co:${name}`;
  if (k in _ids) return _ids[k];
  const rows = await igdb('companies', `search "${name}"; fields id,name; limit 5;`);
  const exact = rows.find((c) => c.name && c.name.toLowerCase() === name.toLowerCase());
  return (_ids[k] = (exact || rows[0]) ? (exact || rows[0]).id : null);
}

// preset -> async () => extra where-clause fragment (or '')
const PRESETS = {
  soulslike: async () => { const id = await resolveKeyword('souls-like'); return id ? `keywords = (${id})` : ''; },
  metroidvania: async () => { const id = await resolveKeyword('metroidvania'); return id ? `keywords = (${id})` : ''; },
  jrpg: async () => { const id = await resolveKeyword('jrpg'); return id ? `keywords = (${id})` : ''; },
  arpg: async () => { const id = await resolveKeyword('action-rpg'); return id ? `keywords = (${id})` : ''; },
  fromsoft: async () => { const id = await resolveCompany('FromSoftware'); return id ? `involved_companies.company = (${id})` : ''; },
  rockstar: async () => { const id = await resolveCompany('Rockstar Games'); return id ? `involved_companies.company = (${id})` : ''; },
};

// platform slug -> IGDB platform ids
const PLATFORMS = {
  xbox: [169, 49],   // Series X|S, One
  psn: [167, 48],    // PS5, PS4
  ps: [167, 48],
  steam: [6],
  pc: [6],
  switch: [130, 508], // Switch, Switch 2
};

const SORTS = {
  popularity: 'sort total_rating_count desc',
  rating: 'sort total_rating desc',
  release: 'sort first_release_date desc',
  name: 'sort name asc',
};

const GAME_FIELDS =
  'fields name,summary,cover.image_id,first_release_date,total_rating,total_rating_count,' +
  'genres.name,keywords.name,themes.name,platforms.name,platforms.abbreviation,' +
  'screenshots.image_id,involved_companies.company.name,involved_companies.developer,url';

function normalize(g) {
  const companies = (g.involved_companies || [])
    .filter((c) => c && c.company && c.company.name)
    .map((c) => ({ name: c.company.name, developer: !!c.developer }));
  return {
    id: g.id,
    name: g.name,
    summary: g.summary || null,
    cover: IMG(g.cover && g.cover.image_id, 'cover_big'),
    coverId: (g.cover && g.cover.image_id) || null,
    year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
    rating: g.total_rating != null ? Math.round(g.total_rating) : null,
    ratingCount: g.total_rating_count || 0,
    genres: (g.genres || []).map((x) => x.name),
    keywords: (g.keywords || []).map((x) => x.name).slice(0, 12),
    themes: (g.themes || []).map((x) => x.name),
    platforms: (g.platforms || []).map((x) => x.abbreviation || x.name),
    screenshots: (g.screenshots || []).map((s) => IMG(s.image_id, 'screenshot_med')).filter(Boolean).slice(0, 6),
    companies,
    url: g.url || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const q = req.query || {};
    const page = Math.max(0, parseInt(q.page, 10) || 0);
    const limit = Math.min(40, parseInt(q.limit, 10) || 30);
    const offset = page * limit;
    const nowTs = Math.floor(Date.now() / 1000);

    // Base: real, playable main games with art. category 0 = main game.
    const where = ['category = 0', 'version_parent = null'];
    let sort = SORTS[q.sort] || SORTS.popularity;
    let search = '';

    const rail = String(q.rail || '');
    if (rail === 'popular') {
      where.push('total_rating_count >= 20', 'cover != null');
      sort = 'sort total_rating_count desc';
    } else if (rail === 'upcoming') {
      where.push(`first_release_date > ${nowTs}`, 'hypes > 1', 'cover != null');
      sort = 'sort hypes desc';
    } else if (rail === 'recent') {
      where.push(`first_release_date <= ${nowTs}`, `first_release_date > ${nowTs - 120 * 86400}`, 'cover != null', 'total_rating_count >= 3');
      sort = 'sort first_release_date desc';
    } else if (rail === 'highly_rated') {
      where.push('total_rating >= 85', 'total_rating_count >= 40', 'cover != null');
      sort = 'sort total_rating desc';
    } else {
      // browse / search / filter
      where.push('cover != null');
      if (q.q) search = `search "${String(q.q).replace(/"/g, '')}";`;
      if (q.preset && PRESETS[q.preset]) {
        const frag = await PRESETS[q.preset]();
        if (frag) where.push(frag);
      }
      if (q.genre) where.push(`genres.slug = "${String(q.genre).replace(/"/g, '')}"`);
      if (q.platform && PLATFORMS[q.platform]) where.push(`platforms = (${PLATFORMS[q.platform].join(',')})`);
      if (q.year) {
        const y = parseInt(q.year, 10);
        if (y) {
          const start = Math.floor(Date.UTC(y, 0, 1) / 1000);
          const end = Math.floor(Date.UTC(y + 1, 0, 1) / 1000);
          where.push(`first_release_date >= ${start}`, `first_release_date < ${end}`);
        }
      }
    }

    // IGDB's `search` can't be combined with `sort`; drop sort when searching.
    const parts = [GAME_FIELDS + ';'];
    if (search) parts.push(search);
    if (where.length) parts.push(`where ${where.join(' & ')};`);
    if (!search) parts.push(sort + ';');
    parts.push(`limit ${limit};`);
    parts.push(`offset ${offset};`);
    const body = parts.join(' ');

    if (q.debug) {
      res.status(200).json({ query: body });
      return;
    }

    const rows = await igdb('games', body);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
    res.status(200).json({ games: rows.map(normalize) });
  } catch (err) {
    res.status(500).json({ error: 'Discover failed', detail: String((err && err.message) || err) });
  }
}
