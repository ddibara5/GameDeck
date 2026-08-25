// Vercel serverless function - GameDeck "Discover" AI.
// Grounds Claude in the user's real Supabase library and returns a reply.
// The Anthropic key lives ONLY here (server-side) and is never sent to the client.
//
// Required env vars (set in Vercel project settings):
//   ANTHROPIC_API_KEY   - your Anthropic API key (server-side only)
//   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY - publishable client config
// Optional:
//   CLAUDE_MODEL        - defaults to claude-haiku-4-5
//   GAMEDECK_ALLOWED_EMAIL - defaults to the single GameDeck owner

import { clientIp, requireOwner } from './_auth.js';
import { rateLimit } from './_rateLimit.js';

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
- RELEASED ONLY by default: your play-now picks must already be OUT and playable today. Verify each candidate's release date with web search before recommending it. If a game is not out yet, do NOT present it as a pick to play now - either leave it out, or put it under a separate "Upcoming (watch)" heading with its date. Only lead with upcoming titles if he explicitly asks about upcoming games.
- OWNERSHIP CHECK: before presenting any pick, cross-reference its exact title against the library list below. If it appears there (played or UNPLAYED), he already owns it - do not present it as new. If unsure whether a title matches a library entry, assume it might and pick something else.
- Every pick must be "new to you" (not in his library) AND out now. Say where to get it - Game Pass, platform, rough price if useful. Prefer things playable immediately (currently on Game Pass, or out on a platform he has).
- NO INVENTED FACTS: only state ownership, playtime, hours, or completion that actually appear in the library data below. Never invent playtime numbers or claim he has played or owns a game that is not listed.
- TASTE FIDELITY: base taste claims only on his stated profile and library. Do not manufacture preferences he has not shown (for example, do not call turn-based tactics "deep strategy he loves"). Weight toward RPGs, action/adventure, FromSoftware, and Rockstar; avoid the "not interested" genres above.
- Ground each pick in his real taste and, where it helps, connect it to games he owns ("since you liked X..."), but the recommendation itself must be something he does not already have and that is out now.
- Use web search for release dates, prices, Game Pass status, and reviews; prefer recent real facts over memory. Do not invent them - search, or say you are unsure.
- THIN PERIODS: if little or nothing currently out fits his taste, say so plainly and offer to look at upcoming releases or his backlog, instead of forcing a weak or not-yet-released pick.
- ESCAPE HATCH: only if he explicitly asks for something from his backlog or library (e.g. "from my backlog", "something I own", "a game I already have") should you recommend owned titles. Then pick from his UNPLAYED backlog or in-progress games and note his completion % / playtime and whether it is a fresh start or continuing progress.
- Be brief and direct. Bullets over paragraphs. No em dashes or en dashes; use commas or hyphens.
- If the library can answer a data question (how many games, most played, near completion, backlog size), answer from the data.

FINAL CHECK before you send - re-read each pick and fix any that fail:
1. Is it OUT and playable today? If it has a future release date, it is NOT a play-now pick - move it under an "Upcoming (watch)" heading with its date, or drop it. Never call a future-dated game a pick to play right now.
2. Is the title absent from his library list below? If it appears there (played or UNPLAYED), he already owns it - replace it with something he does not own.
3. Are all stats (hours, completion, ownership, "you played X") taken only from the data below, with nothing invented?
Fix any failing pick before you answer.`;

async function loadCatalog(req) {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error('Supabase env vars are not configured.');

  const cols = 'master_id,title,environment,percent,playtime_minutes,earned_awards,total_awards,last_played,status';
  const url = `${base}/rest/v1/games?select=${cols}&order=last_played.desc.nullslast&limit=5000`;
  const rankUrl = `${base}/rest/v1/game_ranks?select=master_id,score,reaction,comparison_count`;
  const headers = { apikey: key, Authorization: req.headers.authorization };
  const [res, rankRes] = await Promise.all([
    fetch(url, { headers }),
    fetch(rankUrl, { headers }),
  ]);
  if (!res.ok) throw new Error(`Supabase read failed: ${res.status}`);
  const rows = await res.json();
  const rankRows = rankRes.ok ? await rankRes.json() : [];
  const ranks = new Map(rankRows.map((r) => [String(r.master_id), r]));

  const plat = { xbox: 'Xbox', psn: 'PS', steam: 'Steam' };
  let backlogCount = 0;
  const lines = rows.map((g) => {
    const h = Math.round((g.playtime_minutes || 0) / 6) / 10; // hours, 1 dp
    const yr = g.last_played ? String(g.last_played).slice(0, 7) : 'never';
    const pct = Math.round(g.percent || 0);
    const unplayed = !g.last_played && (g.playtime_minutes || 0) === 0;
    if (unplayed) backlogCount++;
    const rank = ranks.get(String(g.master_id));
    const tag = unplayed ? ' | UNPLAYED' : '';
    const personalRank = rank ? ` | MY-RANK ${Math.round(rank.score)} (${rank.reaction}, ${rank.comparison_count} comparisons)` : '';
    return `${g.title} | ${plat[g.environment] || g.environment} | ${pct}% | ${h}h | ach ${g.earned_awards || 0}/${g.total_awards || 0} | last ${yr}${tag}${personalRank}`;
  });

  const header = `Dave's library: ${rows.length} games, of which ${backlogCount} are owned but NEVER played (his backlog, tagged UNPLAYED). Format: Title | Platform | Completion% | Hours | Achievements | LastPlayed(YYYY-MM) | UNPLAYED(only if never played)`;
  return `${header}\n${lines.join('\n')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await requireOwner(req, res);
  if (!user) return;
  const quota = rateLimit(`chat:${user.id}:${clientIp(req)}`, { limit: 12, windowMs: 10 * 60 * 1000 });
  if (!quota.allowed) {
    res.setHeader('Retry-After', String(quota.retryAfter));
    res.status(429).json({ error: 'Too many requests. Try again shortly.' });
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
      .map((m) => ({ role: m.role, content: m.content.trim() }));

    if (clean.length === 0 || clean[clean.length - 1].role !== 'user') {
      res.status(400).json({ error: 'messages must end with a user turn' });
      return;
    }
    if (clean.some((m) => m.content.length > 4000) || clean.reduce((n, m) => n + m.content.length, 0) > 16000) {
      res.status(413).json({ error: 'Conversation is too long. Start a new chat or shorten the message.' });
      return;
    }

    const catalog = await loadCatalog(req);

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
    console.error(JSON.stringify({ event: 'chat_failed', error: String(err && err.message || err) }));
    res.status(500).json({ error: 'Server error', detail: String(err && err.message || err) });
  }
}
