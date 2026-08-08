// Vercel serverless function - GameDeck "Discover" AI.
// Grounds Claude in the user's real Supabase library and returns a reply.
// The Anthropic key lives ONLY here (server-side) and is never sent to the client.
//
// Required env vars (set in Vercel project settings):
//   ANTHROPIC_API_KEY   - your Anthropic API key (server-side only)
//   SUPABASE_URL        - https://YOUR-PROJECT.supabase.co
//   SUPABASE_ANON_KEY   - the public anon key (read-only; RLS allows SELECT)
// Optional:
//   CLAUDE_MODEL        - defaults to claude-haiku-4-5
//   GAMEDECK_APP_SECRET - if set, callers must send header `x-gamedeck-key` matching it

const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5';

const SYSTEM_PROMPT = `You are GameDeck, a sharp gaming concierge and recommender for one person, Dave.
Your default job is to recommend NEW games Dave does NOT already own, worth playing next. His library (below) is CONTEXT, not the menu: use it two ways - (1) as his taste profile, and (2) as a do-not-recommend list, so you never suggest a game he already owns unless he explicitly asks for one. Use web search to find current, real information (new and upcoming releases, what is on Game Pass now, review reception, how long a game is, rough price).

His taste (weight recommendations toward this):
- Loves: RPGs (Final Fantasy, Persona, Elden Ring-likes), action/adventure (GTA, RDR, Spider-Man). Follows FromSoftware and Rockstar closely.
- Platforms: multi-platform - Xbox Series X/S (primary), PS5, Switch/Switch 2, Gaming PC, ROG Ally X. Prefers Xbox + Game Pass first when it applies.
- Not interested in: VR, sports, esports, MMO grind/raid content, battle royales. Never recommend these.

His library below has two kinds: games he has PLAYED, and a large BACKLOG he owns but has NEVER played (tagged UNPLAYED). Treat BOTH as already-owned: do not recommend them by default.

How to recommend:
- Default to games he does NOT own. Lead with ONE clear pick, then 1-2 alternates. Never dump a long list.
- Every pick must be "new to you" (not in his library). Say where to get it - Game Pass, platform, rough price if useful. Prefer things playable now (currently on Game Pass, or out on a platform he has) unless he asks otherwise.
- Ground each pick in his taste and, where it helps, connect it to games he owns ("since you liked X..."), but the recommendation itself must be something he does not already have.
- Use web search for release dates, prices, Game Pass status, and reviews; prefer recent real facts over memory. Do not invent them - search, or say you are unsure.
- ESCAPE HATCH: only if he explicitly asks for something from his backlog or library (e.g. "from my backlog", "something I own", "a game I already have") should you recommend owned titles. Then pick from his UNPLAYED backlog or in-progress games and note his completion % / playtime and whether it is a fresh start or continuing progress.
- Be brief and direct. Bullets over paragraphs. No em dashes or en dashes; use commas or hyphens.
- If the library can answer a data question (how many games, most played, near completion, backlog size), answer from the data.`;

async function loadCatalog() {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error('Supabase env vars are not configured.');

  const cols = 'title,environment,percent,playtime_minutes,earned_awards,total_awards,last_played,status';
  const url = `${base}/rest/v1/games?select=${cols}&order=last_played.desc.nullslast&limit=5000`;
  const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Supabase read failed: ${res.status}`);
  const rows = await res.json();

  const plat = { xbox: 'Xbox', psn: 'PS', steam: 'Steam' };
  let backlogCount = 0;
  const lines = rows.map((g) => {
    const h = Math.round((g.playtime_minutes || 0) / 6) / 10; // hours, 1 dp
    const yr = g.last_played ? String(g.last_played).slice(0, 7) : 'never';
    const pct = Math.round(g.percent || 0);
    const unplayed = !g.last_played && (g.playtime_minutes || 0) === 0;
    if (unplayed) backlogCount++;
    const tag = unplayed ? ' | UNPLAYED' : '';
    return `${g.title} | ${plat[g.environment] || g.environment} | ${pct}% | ${h}h | ach ${g.earned_awards || 0}/${g.total_awards || 0} | last ${yr}${tag}`;
  });

  const header = `Dave's library: ${rows.length} games, of which ${backlogCount} are owned but NEVER played (his backlog, tagged UNPLAYED). Format: Title | Platform | Completion% | Hours | Achievements | LastPlayed(YYYY-MM) | UNPLAYED(only if never played)`;
  return `${header}\n${lines.join('\n')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Optional shared-secret guard for this (paid) endpoint. If GAMEDECK_APP_SECRET is
  // set in the Vercel project, every request must send a matching x-gamedeck-key header.
  // If unset, the endpoint stays open, so deploying this never breaks the app until you opt in.
  const APP_SECRET = process.env.GAMEDECK_APP_SECRET;
  if (APP_SECRET && req.headers['x-gamedeck-key'] !== APP_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Server missing ANTHROPIC_API_KEY' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const clean = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-16) // keep the last 16 turns
      .map((m) => ({ role: m.role, content: m.content }));

    if (clean.length === 0 || clean[clean.length - 1].role !== 'user') {
      res.status(400).json({ error: 'messages must end with a user turn' });
      return;
    }

    const catalog = await loadCatalog();

    const requestBody = {
      model: MODEL,
      max_tokens: 1024,
      system: [
        { type: 'text', text: SYSTEM_PROMPT },
        // Cache the (large, stable) catalog so repeat turns in a session are ~10x cheaper.
        { type: 'text', text: catalog, cache_control: { type: 'ephemeral' } },
      ],
      // Live web search so recommendations can include new / not-yet-owned games,
      // Game Pass status, prices, and reviews. max_uses caps cost per request.
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }],
      messages: clean,
    };

    // The API runs the search server-side, but a long search turn can come back
    // with stop_reason "pause_turn"; re-send the assistant content unchanged to continue.
    let convo = clean;
    const textParts = [];
    const citations = [];
    for (let i = 0; i < 4; i++) {
      requestBody.messages = convo;
      const aRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!aRes.ok) {
        const detail = await aRes.text();
        res.status(502).json({ error: 'AI request failed', detail: detail.slice(0, 500) });
        return;
      }

      const data = await aRes.json();
      for (const b of data.content || []) {
        if (b.type === 'text' && b.text) {
          textParts.push(b.text);
          for (const c of b.citations || []) {
            if (c && c.url) citations.push({ url: c.url, title: c.title || c.url });
          }
        }
      }

      if (data.stop_reason === 'pause_turn') {
        convo = [...convo, { role: 'assistant', content: data.content }];
        continue;
      }
      break;
    }

    let reply = textParts.join('').trim();

    // If the model searched, append up to 4 unique sources (citations are required
    // when showing web results to users, and it makes the "research" visible).
    const seen = new Set();
    const sources = [];
    for (const c of citations) {
      if (seen.has(c.url)) continue;
      seen.add(c.url);
      sources.push(`- [${c.title}](${c.url})`);
      if (sources.length >= 4) break;
    }
    if (sources.length) reply += `\n\nSources:\n${sources.join('\n')}`;

    res.status(200).json({ reply: reply || 'No reply.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error', detail: String(err && err.message || err) });
  }
}
