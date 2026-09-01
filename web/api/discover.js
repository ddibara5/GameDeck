// Vercel serverless function - GameDeck "Discover" catalog proxy.
// Talks to IGDB (via Twitch app credentials) so the client never sees the secret.
// Read-only game metadata, but Twitch/IGDB quotas are still finite. Every request
// is authenticated as the GameDeck owner and rate-limited before a token is used.
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

import { clientIp, isN8nService, requireOwner } from './_auth.js';
import { rateLimit } from './_rateLimit.js';
import { classifyProductionScale, filterByProductionScale, selectedProductionScales } from '../src/lib/productionScale.js';

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
// The vibe presets below mirror lib/vibes.js, which the Library and the shuffler
// filter by. Every id was resolved live via ?keywordLookup= rather than guessed.
//
// They are NOT all keywords. IGDB splits this vocabulary across two endpoints with
// no obvious rule: post-apocalyptic (kw 69) and story rich (kw 2426) are keywords,
// while open world (theme 38), stealth (theme 23) and horror (theme 19) are THEMES.
// Searching keywords for "open world" returns "open world adventure" and friends
// but no exact match, which looks like a plausible answer and is not one.
//
// soulslike carries BOTH ids: IGDB uses two spellings, `soulslike` (17326) and
// `souls-like` (56427), and this preset only had the first, so it had been quietly
// under-reporting. lib/vibes.js already matched both on the library side.
const PRESETS = {
  soulslike: 'keywords = (17326, 56427)',
  openworld: 'themes = (38)',
  stealth: 'themes = (23)',
  postapoc: 'keywords = (69)',
  horror: 'themes = (19)',
  story: 'keywords = (2426)',
  metroidvania: 'keywords = (477)',
  jrpg: 'keywords = (521)',
  arpg: 'genres = (12)',
  survival: 'themes = (21)',
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
      return { where: ['total_rating_count >= 20', NO_ALT_EDITIONS, NO_ADDONS], sort: 'sort total_rating_count desc' };
    case 'upcoming':
      return { where: [`first_release_date > ${nowTs}`, 'hypes > 1', NO_ALT_EDITIONS, NO_ADDONS], sort: 'sort hypes desc' };
    case 'recent':
      return {
        where: [
          `first_release_date <= ${nowTs}`,
          `first_release_date > ${nowTs - 120 * 86400}`,
          // This floor is the OTHER HALF of coming_soon's `hypes >= 3`, and the two
          // must stay in sync: coming_soon selects on hype, so a game that leaves it
          // at midnight has to be admitted here on the same signal or it lands
          // nowhere. A ratings-only floor did exactly that. Ratings take days or
          // weeks to accumulate, so every just-released game fell into a dead zone
          // between the rails: measured 13 Aug 2026, only 8 of the newest 1000
          // releases cleared `total_rating_count >= 3`, and the rail's front edge
          // sat 8 days in the past. `hypes` is a pre-release follow count that
          // PERSISTS after launch (193 of those 1000 still carried a non-zero
          // value), which is what makes it usable on both sides of the boundary.
          // Duskfade released with hypes 23 and 0 ratings; it now qualifies on day 0.
          '(total_rating_count >= 3 | hypes >= 3)',
          NO_ALT_EDITIONS,
          NO_ADDONS,
        ],
        sort: 'sort first_release_date desc',
      };
    case 'highly_rated':
      // The rating floor is deliberately looser than it looks: ranking is done
      // by weightedRating below, so an 84-rated game with 900 votes can rightly
      // outrank an 86-rated one with 45. The floor only shapes the pool.
      return {
        where: ['total_rating >= 75', 'total_rating_count >= 40', NO_ALT_EDITIONS, NO_ADDONS],
        sort: 'sort total_rating_count desc',
        rerank: true,
      };
    case 'coming_soon':
      // Was `first_release_date > now` and nothing else, which returned the raw
      // daily storefront dump sorted by soonest: 40 of 40 results had no ratings
      // and no following. `hypes` (people following a game before release) is the
      // only signal that separates them, since an unreleased game has no ratings
      // by definition. The neighbouring "Most anticipated" rail has used
      // `hypes > 1` all along and returns GTA VI / Fable / Gears of War, so the
      // floor is set deliberately low here: it sorts by date, not by hypes, so
      // this threshold is doing all the work on its own.
      return {
        where: [`first_release_date > ${nowTs}`, 'hypes >= 3', NO_ALT_EDITIONS, NO_ADDONS],
        sort: 'sort first_release_date asc',
      };
    case 'just_added':
      return { where: ['total_rating_count >= 1', NO_ALT_EDITIONS, NO_ADDONS], sort: 'sort created_at desc' };
    case 'hidden_gems':
      // Hidden gems keeps its low-exposure vote band; weighting stops the
      // thinnest-evidence entries from automatically taking the top slots.
      return {
        where: ['total_rating >= 75', 'total_rating_count >= 8', 'total_rating_count <= 40', NO_ALT_EDITIONS, NO_ADDONS],
        sort: 'sort total_rating desc',
        rerank: true,
      };
    default:
      return null;
  }
}

// Build the full IGDB query body for one rail (page 0, given limit).
// Bayesian (IMDb-style) weighted rating.
//
// Sorting by raw average rewards whoever has the fewest votes: "Hidden gems" was
// returning seven games scored 100, among them "Bubsy 3D: Bubsy Visits the James
// Turrell Retrospective", while "Critically acclaimed" led with "American
// Chopper". Pull every score toward the global mean in proportion to how thin
// the evidence behind it is:
//
//   weighted = (v / (v + m)) * R + (m / (v + m)) * C
//
// C is IGDB's approximate global mean rating; m is the vote count at which a
// game's own score carries half the weight. A 100 from 8 voters lands near 79;
// an 88 from 400 voters barely moves, staying around 87.
const BAYES_C = 72;
const BAYES_M = 25;

function weightedRating(g) {
  const R = Number(g.total_rating);
  if (!Number.isFinite(R)) return 0;
  const v = Number(g.total_rating_count) || 0;
  return (v / (v + BAYES_M)) * R + (BAYES_M / (v + BAYES_M)) * BAYES_C;
}

// Rails ranked on quality rather than on a date can't be ordered by IGDB itself:
// apicalypse has no computed sort. So pull a wider candidate pool, rank it here,
// and hand back the requested slice. Pool size is a balance - big enough that the
// ranking is meaningful, small enough that seven rails can still be fetched in
// parallel on one warm function.
const RERANK_POOL = 120;

// The top-bar filters, as IGDB where-fragments. Shared so a filter means exactly
// the same thing whether it is narrowing a flat search or narrowing every rail on
// the Discover home.
function filterClauses(q, nowTs) {
  const where = [];
  if (q.preset && PRESETS[q.preset]) where.push(PRESETS[q.preset]);
  if (q.genre) where.push(`genres.slug = "${String(q.genre).replace(/"/g, '')}"`);
  // Accepts a comma-separated list, because the standing platform filter is a
  // SET ("Xbox and PS5") rather than a single choice. A bare slug still works,
  // and an unknown slug contributes nothing instead of failing the whole query.
  if (q.platform) {
    const ids = String(q.platform)
      .split(',')
      .flatMap((s) => PLATFORMS[s.trim()] || []);
    if (ids.length) where.push(`platforms = (${[...new Set(ids)].join(',')})`);
  }
  if (q.year) {
    const y = parseInt(q.year, 10);
    if (y) {
      const start = Math.floor(Date.UTC(y, 0, 1) / 1000);
      const end = Math.floor(Date.UTC(y + 1, 0, 1) / 1000);
      where.push(`first_release_date >= ${start}`, `first_release_date < ${end}`);
    }
  }
  // Availability: released games have a past date, upcoming ones a future date.
  // (Null-dated games are excluded by either comparison, which is what we want.)
  if (q.status === 'released') where.push(`first_release_date <= ${nowTs}`);
  else if (q.status === 'upcoming') where.push(`first_release_date > ${nowTs}`);
  return where;
}

// `extra` carries the active top-bar filters; a rail narrowed past the point of
// having any matches simply returns nothing and the client hides that shelf.
// `sortOverride` is the user picking an explicit order, which also suppresses
// weighted re-ranking - they asked for a specific sort, so give them that one.
function railBody(rail, nowTs, limit, offset = 0, extra = [], sortOverride = null) {
  const rc = railClauses(rail, nowTs);
  if (!rc) return null;
  const where = ['cover != null', ...rc.where, ...extra];
  const rerank = rc.rerank && !sortOverride;
  const take = rerank ? RERANK_POOL : limit;
  const skip = rerank ? 0 : offset;
  const sort = sortOverride || rc.sort;
  return `${GAME_FIELDS}; where ${where.join(' & ')}; ${sort}; limit ${take}; offset ${skip};`;
}

function rankByWeighted(rows, limit, offset = 0) {
  return rows
    .slice()
    .sort((a, b) => weightedRating(b) - weightedRating(a))
    .slice(offset, offset + limit);
}

// Apply a rail's re-ranking (if any) and return the requested window.
function applyRerank(rail, nowTs, rows, limit, offset = 0, sortOverride = null) {
  const rc = railClauses(rail, nowTs);
  if (!rc || !rc.rerank || sortOverride) return rows;
  return rankByWeighted(rows, limit, offset);
}

const GAME_FIELDS =
  'fields name,summary,cover.image_id,first_release_date,total_rating,total_rating_count,' +
  'genres.name,keywords.name,themes.name,platforms.name,platforms.abbreviation,' +
  'screenshots.image_id,artworks.image_id,involved_companies.company.name,involved_companies.developer,url,' +
  'release_dates.date,release_dates.category,release_dates.human,' +
  'game_type,parent_game,version_parent';

// Alternate editions ("Deluxe Edition", "Game of the Year Edition") are separate
// IGDB rows pointing at the real game via version_parent. They are never what you
// want in a release list, and unlike the game_type enum this field is not
// deprecated, so it is safe to filter on today.
const NO_ALT_EDITIONS = 'version_parent = null';

// Sub-releases that are not a game you would go and play: add-on DLC, bundles,
// mods, single episodes, seasons, content packs and patch entries. Verified
// against live API responses, which return game_type ids matching the historical
// category enum (0 main game, 2 expansion, 8 remake, 11 port, ...).
//
// Deliberately NOT excluded: expansions (2), standalone expansions (4), remakes
// (8), remasters (9), expanded editions (10) and ports (11). Those are real
// releases people wait for - Shadow of the Erdtree is an expansion, Onimusha:
// Dawn of Dreams is a port - and dropping the whole family to kill add-on noise
// would lose exactly the games worth surfacing. The hypes floor already keeps
// the expansions that do appear to ones with a real following.
const NO_ADDONS = 'game_type != (1,3,5,6,7,13,14)';

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

// Normalized release: the date the rails actually select on, plus how precise
// IGDB is about it. { ts, precision, label }.
//
// This used to report the EARLIEST date across every platform and region, which
// disagreed with `first_release_date` - the field every rail filters and sorts
// by - because IGDB does not define one as the minimum of the other. A game that
// launched in early access in 2015 and hit 1.0 last month carries both dates, so
// "Recently released" was showing "Jan 20, 2016" for a game it had selected as
// released this quarter. The same mismatch, pointing the other way, made
// "Coming soon" show dates already in the past.
//
// So anchor the label to first_release_date: pick the release_dates entry that
// sits closest to it and borrow that entry's precision and wording. The date on
// screen then always agrees with the reason the game is in the rail at all.
function computeRelease(g) {
  const rds = (g.release_dates || []).filter(Boolean);
  const dated = rds.filter((r) => typeof r.date === 'number');
  const anchor = Number(g.first_release_date) || null;

  if (!dated.length) {
    const withHuman = rds.find((r) => r.human);
    return { ts: anchor, precision: 'tba', label: (withHuman && withHuman.human) || 'TBA' };
  }

  let best = dated[0];
  if (anchor) {
    let bestGap = Infinity;
    for (const r of dated) {
      const gap = Math.abs(r.date - anchor);
      if (gap < bestGap) {
        bestGap = gap;
        best = r;
      }
    }
  } else {
    dated.sort((a, b) => a.date - b.date);
    best = dated[0];
  }

  const precision = precisionFromCategory(best.category) || precisionFromHuman(best.human) || 'day';
  return { ts: best.date, precision, label: best.human || null };
}

// The one image the game sheet paints its backdrop from. Key art first, then a
// screenshot, then the cover, which is always there and is the reason this can
// never come back empty for an enriched game.
function pickBackdrop(g) {
  const art = (g.artworks || []).find((a) => a && a.image_id);
  if (art) return { id: art.image_id, kind: 'artwork' };
  const shot = (g.screenshots || []).find((s) => s && s.image_id);
  if (shot) return { id: shot.image_id, kind: 'screenshot' };
  const cov = g.cover && g.cover.image_id;
  return cov ? { id: cov, kind: 'cover' } : { id: null, kind: null };
}

function normalize(g) {
  const companies = (g.involved_companies || [])
    .filter((c) => c && c.company && c.company.name)
    .map((c) => ({ name: c.company.name, developer: !!c.developer }));
  const backdrop = pickBackdrop(g);
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
    // ARTWORKS are key art without a HUD on it, which is what you actually want
    // behind a card; screenshots are gameplay and often carry a health bar and a
    // minimap. Coverage is thinner than screenshots, so this is a preference,
    // not a source.
    artworks: (g.artworks || []).map((a) => IMG(a.image_id, 'screenshot_med')).filter(Boolean).slice(0, 4),
    // The ONE image id the game sheet should paint its backdrop from, chosen
    // here rather than in the client so the preference order lives in one place:
    // key art, else a screenshot, else the cover. `backdropKind` travels with it
    // because the id alone does not say which IGDB size bucket it lives in, and
    // asking for the wrong bucket is a 404 rather than a smaller picture.
    backdropId: backdrop.id,
    backdropKind: backdrop.kind,
    companies,
    productionScale: classifyProductionScale(g),
    url: g.url || null,
    // Surfaced so the deprecated-`category` replacement can be checked against
    // live data before anything filters on it. gameType is an id from IGDB's
    // game_types table; parentGame is set on DLC, expansions and episodes.
    gameType: g.game_type != null ? g.game_type : null,
    parentGame: g.parent_game != null ? g.parent_game : null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  // Scheduled Game Pass matching is server-to-server work and cannot carry the
  // owner's short-lived browser JWT. Only this route opts into the private n8n
  // credential; every browser call still takes the normal owner-auth path.
  const serviceCall = isN8nService(req);
  const user = serviceCall ? { id: 'n8n-gamepass-sync' } : await requireOwner(req, res);
  if (!user) return;
  const quota = rateLimit(`discover:${user.id}:${clientIp(req)}`, {
    // The nightly matcher resolves roughly 500 titles in controlled n8n batches.
    // It gets its own ceiling so it cannot consume the owner's interactive quota.
    limit: serviceCall ? 700 : 120,
    windowMs: 10 * 60 * 1000,
  });
  if (!quota.allowed) {
    res.setHeader('Retry-After', String(quota.retryAfter));
    res.status(429).json({ error: 'Too many catalog requests. Try again shortly.' });
    return;
  }
  try {
    const q = req.query || {};
    const queryChars = Object.values(q).reduce((n, value) => n + String(value || '').length, 0);
    if (queryChars > 1200) {
      res.status(413).json({ error: 'Query is too long.' });
      return;
    }

    // Taxonomy lookup, for adding entries to PRESETS. PRESETS filters by IGDB id,
    // and a guessed id fails silently in the worst way: the query still succeeds
    // and still returns games, just the wrong ones. This resolves names to ids
    // from IGDB itself so a preset is never added on a hunch.
    //
    // IGDB splits this vocabulary across two endpoints and it is NOT obvious which
    // holds what: "post-apocalyptic" and "story rich" are keywords, while "open
    // world", "stealth" and "horror" are THEMES. Looking only at keywords returns
    // near-miss variants ("open world adventure") and reads like a valid answer.
    //
    //   /api/discover?keywordLookup=open world,stealth        (keywords, default)
    //   /api/discover?keywordLookup=*&lookupIn=themes         (list all themes)
    //   /api/discover?keywordLookup=17326&lookupIn=keywords   (reverse, by id)
    if (q.keywordLookup) {
      const endpoint = q.lookupIn === 'themes' ? 'themes' : q.lookupIn === 'genres' ? 'genres' : 'keywords';
      const terms = String(q.keywordLookup)
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 12);
      const out = {};
      for (const term of terms) {
        let where;
        if (term === '*') where = '';
        else if (/^\d+$/.test(term)) where = ` where id = ${term};`;
        else {
          const esc = term.replace(/"/g, '');
          // Exact OR contains, so "horror" reports the plain entry alongside
          // "survival horror" rather than hiding either.
          where = ` where name = "${esc}" | name ~ *"${esc}"*;`;
        }
        const rows = await igdb(endpoint, `fields id,name,slug;${where} limit 100; sort name asc;`);
        out[term] = (rows || []).map((r) => ({ id: r.id, name: r.name, slug: r.slug }));
      }
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ lookupIn: endpoint, keywordLookup: out });
      return;
    }

    const page = Math.max(0, parseInt(q.page, 10) || 0);
    const limit = Math.min(40, parseInt(q.limit, 10) || 30);
    const offset = page * limit;
    // Day-aligned "now". IGDB stamps first_release_date at UTC MIDNIGHT, so it
    // encodes a calendar day, not a moment. Comparing it against a mid-day
    // Date.now() made every window ragged: `> nowTs - 120*86400` cut the
    // "Recently released" pool at whatever hour the request happened to land on,
    // so a game released exactly 120 days ago was in the rail in the morning and
    // out of it in the afternoon. Anchoring to UTC midnight makes the boundaries
    // whole days, and matches releaseDayDelta() on the client so a card's label
    // and the rail that selected it can no longer disagree.
    // Kept the name `nowTs` because it is threaded through railClauses /
    // filterClauses / railBody / applyRerank as a parameter; only the basis moved.
    const today = new Date();
    const nowTs = Math.floor(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) / 1000
    );

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
      const homeExtra = filterClauses(q, nowTs);
      const homeSort = q.sort && SORTS[q.sort] ? SORTS[q.sort] : null;
      const scaleFilterActive = selectedProductionScales(q.scale) !== null;
      const pairs = await Promise.all(
        keys.map(async (k) => {
          // Production scale is a GameDeck classification rather than an IGDB
          // field, so it is applied after the catalog response. Pull a wider
          // candidate pool only when that filter is active, then return the same
          // rail-sized slice as usual. The ordinary home path stays untouched.
          const candidateLimit = scaleFilterActive ? Math.min(200, Math.max(limit * 5, 80)) : limit;
          const body = railBody(k, nowTs, candidateLimit, 0, homeExtra, homeSort);
          if (!body) return [k, []];
          try {
            const rows = await igdb('games', body);
            const scaleRows = filterByProductionScale(rows, q.scale);
            const ordered = applyRerank(k, nowTs, scaleRows, limit, 0, homeSort);
            return [k, ordered.slice(0, limit).map(normalize)];
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

    // Batched TASTE LANES for the For You feed. Same shape and the same reason
    // as `?home=` above: the feed is one IGDB query per lane and there are about
    // five lanes, so they run in parallel on one warm function rather than as
    // five serverless invocations from the client.
    //
    //   /api/discover?lanes=soulslike,openworld,new&platform=xbox,psn&limit=8
    //
    // Every lane key is a PRESET key, except the reserved key `new`, which is
    // the `recent` rail: "out lately on your platforms", which is about your
    // hardware rather than about your taste and so cannot be a preset.
    //
    // **No rating or vote floor here, deliberately.** The measurement that
    // produced this feed found the opposite of the obvious: the small studio is
    // not the problem. Kristala (15h played, one solo studio, zero IGDB
    // ratings) and Dinoblade (24h, one vote) would both be cut by any vote
    // floor, while "Vacation Cafe Simulator" clears one comfortably. The
    // keyword and the platform are doing the filtering, and measured live they
    // do it well: soulslike + Xbox returns Mistfall Hunter, Kristala, Death
    // Howl and Wuchang, where soulslike alone returns ten PC-only micro-indies.
    const lanes = String(q.lanes || '');
    if (lanes) {
      const keys = lanes
        .split(',')
        .map((s2) => s2.trim())
        .filter(Boolean)
        .slice(0, 8);
      const laneExtra = filterClauses({ platform: q.platform }, nowTs);
      const laneLimit = Math.min(20, parseInt(q.limit, 10) || 8);
      const scaleFilterActive = selectedProductionScales(q.scale) !== null;
      // Production scale is inferred from normalized IGDB metadata, so it must
      // be applied after the catalog response. Pull a wider pool only while the
      // filter is active to keep the ordinary For You path unchanged.
      const laneCandidateLimit = scaleFilterActive
        ? Math.min(200, Math.max(laneLimit * 5, 80))
        : laneLimit;
      // Three years. Long enough that a lane is never empty, short enough that
      // "what is new in the things I play" does not become a back catalog.
      const since = nowTs - 1095 * 86400;
      const pairs = await Promise.all(
        keys.map(async (k) => {
          const where =
            k === 'new'
              ? ['cover != null', ...railClauses('recent', nowTs).where, ...laneExtra]
              : PRESETS[k]
                ? [
                    'cover != null',
                    PRESETS[k],
                    `first_release_date <= ${nowTs}`,
                    `first_release_date > ${since}`,
                    NO_ALT_EDITIONS,
                    NO_ADDONS,
                    ...laneExtra,
                  ]
                : null;
          if (!where) return [k, [], false];
          const body = `${GAME_FIELDS}; where ${where.join(' & ')}; sort first_release_date desc; limit ${laneCandidateLimit}; offset 0;`;
          try {
            const rows = await igdb('games', body);
            const scaleRows = filterByProductionScale(rows, q.scale);
            return [k, scaleRows.slice(0, laneLimit).map(normalize), false];
          } catch {
            return [k, [], true];
          }
        })
      );
      const out = {};
      const failedKeys = [];
      pairs.forEach(([k, v, failed]) => {
        out[k] = v;
        if (failed) failedKeys.push(k);
      });
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
      res.status(200).json({ lanes: out, failedKeys });
      return;
    }

    // Base: games with art. (IGDB deprecated the old `category` enum, so we no
    // longer filter on it; `cover != null` keeps results to real, art-having games.)
    const where = ['cover != null'];
    let sort = SORTS[q.sort] || SORTS.popularity;
    let search = '';

    const rail = String(q.rail || '');
    const rc = rail ? railClauses(rail, nowTs) : null;
    if (q.q) search = `search "${String(q.q).replace(/"/g, '')}";`;
    if (rc) {
      // A rail's "see all" page. Any active top-bar filters narrow it too, so the
      // full list matches the shelf the user tapped through from.
      where.push(...rc.where, ...filterClauses(q, nowTs));
      sort = rc.sort;
    } else {
      // The same hygiene every rail applies, which this path had never had.
      // Without it the filter/preset browse returns alternate editions and
      // add-ons as though they were games: on 21 Aug 2026 a soulslike preset
      // query came back with "Lies of P: Overture Bundle" (game_type 3) and
      // "Elden Ring Nightreign - The Forsaken Hollows" (game_type 1, a DLC)
      // sitting between the real releases.
      //
      // Deliberately NOT applied when searching. Someone typing a name is
      // looking for that exact thing, and a bundle or a season is a legitimate
      // answer to a search in a way it never is to a browse.
      where.push(...filterClauses(q, nowTs));
      if (!search) where.push(NO_ALT_EDITIONS, NO_ADDONS);
    }

    // A rail defines the result SET via its `where` filters; when the caller
    // passes an explicit sort (the "see all" list page's sort control), honor it
    // so the whole filtered set re-sorts consistently across pages. Without one,
    // the rail keeps the recommended order set above.
    const explicitSort = Boolean(rail && q.sort && SORTS[q.sort]);
    if (explicitSort) sort = SORTS[q.sort];

    // Quality rails rank on a value IGDB can't sort by, so fetch one pool from
    // the top and page within it. Skipped when the user picked a sort from the
    // list page's own control - that is an explicit instruction to order the
    // set their way, not ours.
    const wantsRerank = Boolean(rc && rc.rerank && !explicitSort && !search);

    // IGDB's `search` can't be combined with `sort`; drop sort when searching.
    const scaleFilterActive = selectedProductionScales(q.scale) !== null;
    const candidateLimit = scaleFilterActive
      ? 500
      : wantsRerank
        ? RERANK_POOL
        : limit;
    const candidateOffset = scaleFilterActive || wantsRerank ? 0 : offset;

    const parts = [GAME_FIELDS + ';'];
    if (search) parts.push(search);
    if (where.length) parts.push(`where ${where.join(' & ')};`);
    if (!search) parts.push(sort + ';');
    parts.push(`limit ${candidateLimit};`);
    parts.push(`offset ${candidateOffset};`);
    const body = parts.join(' ');

    if (q.debug) {
      res.status(200).json({ query: body });
      return;
    }

    const rows = filterByProductionScale(await igdb('games', body), q.scale);
    const ordered = wantsRerank ? rankByWeighted(rows, scaleFilterActive ? offset + limit : limit, scaleFilterActive ? 0 : offset) : rows;
    const windowed = scaleFilterActive ? ordered.slice(offset, offset + limit) : ordered;
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
    res.status(200).json({ games: windowed.map(normalize) });
  } catch (err) {
    console.error(JSON.stringify({ event: 'discover_failed', error: String((err && err.message) || err) }));
    res.status(500).json({ error: 'Discover failed', detail: String((err && err.message) || err) });
  }
}
