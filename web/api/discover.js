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
//   add &status=released|upcoming to constrain by availability (release date vs now)
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

// preset -> extra where-clause fragment. IGDB keyword/company/genre ids confirmed
// live: soulslike kw 17326, metroidvania kw 477, jrpg kw 521, RPG genre 12,
// FromSoftware company 1012, Rockstar Games company 29.
const PRESETS = {
  soulslike: 'keywords = (17326)',
  metroidvania: 'keywords = (477)',
  jrpg: 'keywords = (521)',
  arpg: 'genres = (12)',
  fromsoft: 'involved_companies.company = (1012)',
  rockstar: 'involved_companies.company = (29)',
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
  anticipated: 'sort hypes desc',
  rating: 'sort total_rating desc',
  release: 'sort first_release_date desc',
  name: 'sort name asc',
};

// The where-fragments + sort that DEFINE each home rail. Returned without the
// shared `cover != null` clause (callers always add that). Single source of truth
// for both the single-rail endpoint (?rail=) and the batched home endpoint
// (?home=a,b,c), so the two can never drift apart.
function railClauses(rail, nowTs) {
  switch (rail) {
    case 'popular':
      return { where: ['total_rating_count >= 20'], sort: 'sort total_rating_count desc' };
    case 'upcoming':
      return { where: [`first_release_date > ${nowTs}`, 'hypes > 1'], sort: 'sort hypes desc' };
    case 'recent':
      return {
        where: [`first_release_date <= ${nowTs}`, `first_release_date > ${nowTs - 120 * 86400}`, 'total_rating_count >= 3'],
        sort: 'sort first_release_date desc',
      };
    case 'highly_rated':
      return { where: ['total_rating >= 85', 'total_rating_count >= 40'], sort: 'sort total_rating desc' };
    case 'coming_soon':
      return { where: [`first_release_date > ${nowTs}`], sort: 'sort first_release_date asc' };
    case 'just_added':
      return { where: ['total_rating_count >= 1'], sort: 'sort created_at desc' };
    case 'hidden_gems':
      return { where: ['total_rating >= 80', 'total_rating_count >= 8', 'total_rating_count <= 40'], sort: 'sort total_rating desc' };
    default:
      return null;
  }
}

// Build the full IGDB query body for one rail (page 0, given limit).
function railBody(rail, nowTs, limit) {
  const rc = railClauses(rail, nowTs);
  if (!rc) return null;
  const where = ['cover != null', ...rc.where];
  return `${GAME_FIELDS}; where ${where.join(' & ')}; ${rc.sort}; limit ${limit}; offset 0;`;
}

const GAME_FIELDS =
  'fields name,summary,cover.image_id,first_release_date,total_rating,total_rating_count,' +
  'genres.name,keywords.name,themes.name,platforms.name,platforms.abbreviation,' +
  'screenshots.image_id,involved_companies.company.name,involved_companies.developer,url,' +
  'release_dates.date,release_dates.category,release_dates.human';

// IGDB release_dates.category is a date-FORMAT enum (how precise the date is):
//   0 YYYYMMMMDD (day), 1 YYYYMMMM (month), 2 YYYY (year),
//   3-6 YYYYQ1..Q4 (quarter), 7 TBD. Map it to a coarse precision the UI can trust
//   so we never render a fake exact day for a year- or quarter-only game.
function precisionFromCategory(cat) {
  if (cat === 0) return 'day';
  if (cat === 1) return 'month';
  if (cat === 2) return 'year';
  if (cat === 3 || cat === 4 || cat === 5 || cat === 6) return 'quarter';
  if (cat === 7) return 'tba';
  return null;
}

// Fallback when category is absent: parse IGDB's human string ("2027", "Q1 2027",
// "Mar 2027", "Mar 15, 2027", "TBD").
function precisionFromHuman(h) {
  if (!h) return null;
  const s = String(h).trim();
  if (/tbd/i.test(s)) return 'tba';
  if (/^Q[1-4]\s+\d{4}$/i.test(s)) return 'quarter';
  if (/^\d{4}$/.test(s)) return 'year';
  if (/\d{1,2},\s*\d{4}$/.test(s)) return 'day';
  if (/^[A-Za-z]{3,9}\s+\d{4}$/.test(s)) return 'month';
  return null;
}

// Normalized release: the earliest concrete release across platforms/regions, plus
// how precise IGDB actually is about it. { ts, precision, label }.
function computeRelease(g) {
  const rds = (g.release_dates || []).filter(Boolean);
  const dated = rds.filter((r) => typeof r.date === 'number');
  if (!dated.length) {
    const withHuman = rds.find((r) => r.human);
    return { ts: g.first_release_date || null, precision: 'tba', label: (withHuman && withHuman.human) || 'TBA' };
  }
  dated.sort((a, b) => a.date - b.date);
  const first = dated[0];
  const precision = precisionFromCategory(first.category) || precisionFromHuman(first.human) || 'day';
  return { ts: first.date, precision, label: first.human || null };
}

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
    released: g.first_release_date || null,
    release: computeRelease(g),
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

    // Direct by-id lookup (used by the game sheet to enrich owned/wishlisted games
    // with the same summary + screenshots Discover shows). Bypasses rails/filters.
    const idList = String(q.ids || '')
      .split(',')
      .map((s) => parseInt(s, 10))
      .filter(Boolean);
    if (idList.length) {
      const body = `${GAME_FIELDS}; where id = (${idList.slice(0, 20).join(',')}); limit ${idList.length};`;
      const rows = await igdb('games', body);
      res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
      res.status(200).json({ games: rows.map(normalize) });
      return;
    }

    // Batched home rails: the Discover home requests all of its enabled rails in a
    // SINGLE call (?home=popular,upcoming,...). One warm function + one token runs
    // the rails' IGDB queries in parallel server-side, instead of the client firing
    // one serverless invocation per rail. Returns { rails: { key: games[] } }.
    const home = String(q.home || '');
    if (home) {
      const keys = home
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12);
      const pairs = await Promise.all(
        keys.map(async (k) => {
          const body = railBody(k, nowTs, limit);
          if (!body) return [k, []];
          try {
            const rows = await igdb('games', body);
            return [k, rows.map(normalize)];
          } catch {
            return [k, []];
          }
        })
      );
      const rails = {};
      pairs.forEach(([k, v]) => (rails[k] = v));
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
      res.status(200).json({ rails });
      return;
    }

    // Base: games with art. (IGDB deprecated the old `category` enum, so we no
    // longer filter on it; `cover != null` keeps results to real, art-having games.)
    const where = ['cover != null'];
    let sort = SORTS[q.sort] || SORTS.popularity;
    let search = '';

    const rail = String(q.rail || '');
    const rc = rail ? railClauses(rail, nowTs) : null;
    if (rc) {
      where.push(...rc.where);
      sort = rc.sort;
    } else {
      // browse / search / filter
      where.push('cover != null');
      if (q.q) search = `search "${String(q.q).replace(/"/g, '')}";`;
      if (q.preset && PRESETS[q.preset]) where.push(PRESETS[q.preset]);
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
      // Availability: released games have a past date; upcoming ones a future date.
      // (Null-dated games are excluded by either comparison, which is what we want.)
      if (q.status === 'released') {
        where.push(`first_release_date <= ${nowTs}`);
      } else if (q.status === 'upcoming') {
        where.push(`first_release_date > ${nowTs}`);
      }
    }

    // A rail defines the result SET via its `where` filters; when the caller
    // passes an explicit sort (the "see all" list page's sort control), honor it
    // so the whole filtered set re-sorts consistently across pages. Without one,
    // the rail keeps the recommended order set above.
    if (rail && q.sort && SORTS[q.sort]) sort = SORTS[q.sort];

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
