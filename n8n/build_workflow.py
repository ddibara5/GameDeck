import json, uuid

def nid(): return str(uuid.uuid4())

build_requests = r"""
// Build one item per (environment, page). Over-provisioned page counts give
// headroom for library growth; empty pages simply return no games.
const PLAYER = '5270041';           // Exophase account-wide player id (Davizzle93)
const plan = [['xbox', 20], ['psn', 3], ['steam', 3]];
const out = [];
for (const [env, pages] of plan) {
  for (let p = 1; p <= pages; p++) {
    const url = `https://api.exophase.com/public/player/${PLAYER}/games`
      + `?page=${p}&environment=${env}&sort=1&showHidden=0`;
    out.push({ json: { environment: env, page: p, targetUrl: url } });
  }
}
return out;
""".strip()

parse_games = r"""
// Parse every FlareSolverr response. FlareSolverr returns the target's body
// rendered by a headless browser, so a raw JSON endpoint arrives wrapped in
// HTML (<pre>...</pre>). We extract the JSON object and normalise each game
// into a row that matches the Supabase `games` table.
const items = $input.all();
const byId = {};
const toMin = (u) => (u && typeof u === 'object') ? ((u.hours || 0) * 60 + (u.minutes || 0)) : 0;
const tsToIso = (s) => (s && Number(s) > 0) ? new Date(Number(s) * 1000).toISOString() : null;

for (const it of items) {
  const env = it.json.environment;
  const sol = it.json.solution;
  const raw = sol && sol.response;
  if (!raw) continue;

  let jsonText = raw;
  if (raw.indexOf('<') !== -1) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) continue;
    jsonText = raw.slice(start, end + 1)
      .replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&amp;/g, '&');
  }

  let data;
  try { data = JSON.parse(jsonText); } catch (e) { continue; }
  if (!data || !data.success || !Array.isArray(data.games)) continue;

  for (const g of data.games) {
    if (g.master_id == null) continue;
    const meta = g.meta || {};
    const platforms = Array.isArray(meta.platforms)
      ? meta.platforms.map(p => (p && (p.name || p.title || p.slug)) || p).filter(Boolean)
      : [];
    byId[g.master_id] = {
      master_id: g.master_id,
      environment: meta.environment_slug || env,
      title: meta.title || g.title || 'Unknown',
      platforms,
      earned_awards: g.earned_awards || 0,
      total_awards: g.total_awards || meta.total_awards || 0,
      percent: (typeof g.percent === 'number') ? g.percent : 0,
      earned_points: g.earned_points || 0,
      earned_exp: g.earned_exp || 0,
      playtime_minutes: toMin(g.playtimeUnits),
      playtime_label: g.playtime || null,
      status: g.status || null,
      beaten: (g.beaten === null || g.beaten === undefined) ? null : !!g.beaten,
      last_played: tsToIso(g.lastplayed_utc || g.lastplayed),
      first_played: tsToIso(g.firstplayed),
      completion_date: tsToIso(g.completion_date_utc || g.completion_date),
      cover_small: g.resource_small || null,
      cover_standard: g.resource_standard || null,
      cover_tile: g.resource_tile || null,
      achievements_url: meta.endpoint_awards || null,
      last_synced: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }
}

const rows = Object.values(byId);
if (rows.length === 0) {
  // Fail loudly rather than silently upserting nothing (e.g. Cloudflare blocked us).
  throw new Error('Exophase sync parsed 0 games - check FlareSolverr / Cloudflare.');
}
return rows.map(r => ({ json: r }));
""".strip()

compute_deltas = r"""
// Compare the freshly fetched library to the last known state to build a
// play-history event whenever playtime or achievements increased. A game seen
// for the very first time is recorded with a 0-minute "discovered" event so we
// never invent a giant session on day one.
const fresh = $('Parse Games').all().map(i => i.json);
const existing = $('Get Existing State').all().map(i => i.json);
const prev = {};
for (const e of existing) { if (e && e.master_id != null) prev[e.master_id] = e; }

const today = new Date().toISOString().slice(0, 10);
const out = [];
for (const g of fresh) {
  const p = prev[g.master_id];
  let event = null;
  if (!p) {
    event = {
      master_id: g.master_id, title: g.title, environment: g.environment,
      event_date: today, minutes_delta: 0, achievements_delta: 0,
      percent_after: g.percent, playtime_minutes_after: g.playtime_minutes,
      earned_awards_after: g.earned_awards, last_played: g.last_played, is_new: true
    };
  } else {
    const dMin = (g.playtime_minutes || 0) - (p.playtime_minutes || 0);
    const dAch = (g.earned_awards || 0) - (p.earned_awards || 0);
    if (dMin > 0 || dAch > 0) {
      event = {
        master_id: g.master_id, title: g.title, environment: g.environment,
        event_date: today, minutes_delta: dMin > 0 ? dMin : 0,
        achievements_delta: dAch > 0 ? dAch : 0,
        percent_after: g.percent, playtime_minutes_after: g.playtime_minutes,
        earned_awards_after: g.earned_awards, last_played: g.last_played, is_new: false
      };
    }
  }
  out.push({ json: { game: g, event } });
}
return out;
""".strip()

def node(name, ntype, ver, pos, params, extra=None):
    n = {
        "parameters": params,
        "id": nid(),
        "name": name,
        "type": ntype,
        "typeVersion": ver,
        "position": pos,
    }
    if extra:
        n.update(extra)
    return n

supa_cred = {"credentials": {"supabaseApi": {"id": "REPLACE_WITH_SUPABASE_CREDENTIAL", "name": "GameDeck Supabase (service role)"}}}

nodes = []

nodes.append(node("Every 6h Trigger", "n8n-nodes-base.scheduleTrigger", 1.3, [-160, 300], {
    "rule": {"interval": [{"field": "hours", "hoursInterval": 6}]}
}))

nodes.append(node("Build Page Requests", "n8n-nodes-base.code", 2, [60, 300], {
    "mode": "runOnceForAllItems", "language": "javaScript", "jsCode": build_requests
}))

nodes.append(node("Fetch via FlareSolverr", "n8n-nodes-base.httpRequest", 4.4, [280, 300], {
    "method": "POST",
    "url": "={{ ($env.FLARESOLVERR_URL || 'http://flaresolverr:8191') }}/v1",
    "sendBody": True,
    "specifyBody": "json",
    "jsonBody": "={{ { \"cmd\": \"request.get\", \"url\": $json.targetUrl, \"maxTimeout\": 60000 } }}",
    "options": {"timeout": 75000, "response": {"response": {"neverError": True}}}
}, {"onError": "continueRegularOutput", "retryOnFail": True, "maxTries": 3, "waitBetweenTries": 3000}))

nodes.append(node("Parse Games", "n8n-nodes-base.code", 2, [500, 300], {
    "mode": "runOnceForAllItems", "language": "javaScript", "jsCode": parse_games
}))

get_existing_params = {
    "url": "={{ $env.SUPABASE_URL }}/rest/v1/games?select=master_id,playtime_minutes,earned_awards,percent&limit=5000",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "supabaseApi",
    "options": {}
}
nodes.append(node("Get Existing State", "n8n-nodes-base.httpRequest", 4.4, [720, 300],
                  get_existing_params, {"executeOnce": True, **supa_cred}))

nodes.append(node("Compute Deltas", "n8n-nodes-base.code", 2, [940, 300], {
    "mode": "runOnceForAllItems", "language": "javaScript", "jsCode": compute_deltas
}))

upsert_games_params = {
    "method": "POST",
    "url": "={{ $env.SUPABASE_URL }}/rest/v1/games?on_conflict=master_id",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "supabaseApi",
    "sendHeaders": True,
    "headerParameters": {"parameters": [
        {"name": "Prefer", "value": "resolution=merge-duplicates,return=minimal"}
    ]},
    "sendBody": True,
    "specifyBody": "json",
    "jsonBody": "={{ $('Compute Deltas').all().map(i => i.json.game) }}",
    "options": {}
}
nodes.append(node("Upsert Games", "n8n-nodes-base.httpRequest", 4.4, [1160, 220],
                  upsert_games_params, {"executeOnce": True, **supa_cred}))

insert_events_params = {
    "method": "POST",
    "url": "={{ $env.SUPABASE_URL }}/rest/v1/play_events?on_conflict=master_id,event_date",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "supabaseApi",
    "sendHeaders": True,
    "headerParameters": {"parameters": [
        {"name": "Prefer", "value": "resolution=merge-duplicates,return=minimal"}
    ]},
    "sendBody": True,
    "specifyBody": "json",
    "jsonBody": "={{ $('Compute Deltas').all().filter(i => i.json.event).map(i => i.json.event) }}",
    "options": {}
}
nodes.append(node("Insert Play Events", "n8n-nodes-base.httpRequest", 4.4, [1380, 220],
                  insert_events_params, {"executeOnce": True, **supa_cred}))

log_run_params = {
    "method": "POST",
    "url": "={{ $env.SUPABASE_URL }}/rest/v1/sync_runs",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "supabaseApi",
    "sendHeaders": True,
    "headerParameters": {"parameters": [{"name": "Prefer", "value": "return=minimal"}]},
    "sendBody": True,
    "specifyBody": "json",
    "jsonBody": "={{ { \"games_seen\": $('Compute Deltas').all().length, \"games_changed\": $('Compute Deltas').all().filter(i => i.json.event && (i.json.event.minutes_delta > 0 || i.json.event.achievements_delta > 0)).length, \"status\": \"ok\" } }}",
    "options": {}
}
nodes.append(node("Log Sync Run", "n8n-nodes-base.httpRequest", 4.4, [1600, 220],
                  log_run_params, {"executeOnce": True, **supa_cred}))

sticky_text = (
    "## GameDeck - Exophase Daily Sync\n\n"
    "**Before activating:**\n"
    "1. Set two env vars on the n8n container:\n"
    "   - `SUPABASE_URL` = https://YOUR-PROJECT.supabase.co\n"
    "   - `FLARESOLVERR_URL` = http://flaresolverr:8191 (default if omitted)\n"
    "2. Create a **Supabase API** credential named *GameDeck Supabase (service role)* "
    "using your project URL + the **service_role** key, and select it on the 4 HTTP nodes.\n"
    "3. FlareSolverr must be reachable (docker-compose sidecar) - it clears Cloudflare.\n\n"
    "Exophase's Cloudflare blocks datacenter IPs, so every fetch is routed through FlareSolverr."
)
nodes.append({
    "parameters": {"content": sticky_text, "height": 320, "width": 420, "color": 4},
    "id": nid(), "name": "Setup Notes", "type": "n8n-nodes-base.stickyNote",
    "typeVersion": 1, "position": [-160, -60]
})

def conn(src, dst):
    return {src: {"main": [[{"node": dst, "type": "main", "index": 0}]]}}

connections = {}
chain = ["Daily 06:00 Trigger", "Build Page Requests", "Fetch via FlareSolverr",
         "Parse Games", "Get Existing State", "Compute Deltas", "Upsert Games",
         "Insert Play Events", "Log Sync Run"]
for a, b in zip(chain, chain[1:]):
    connections.update(conn(a, b))

workflow = {
    "name": "GameDeck | Exophase - Daily Library & Play-History Sync",
    "nodes": nodes,
    "connections": connections,
    "active": False,
    "settings": {"executionOrder": "v1", "timezone": "America/Los_Angeles",
                 "saveExecutionProgress": True, "saveManualExecutions": True},
    "meta": {"templateId": "gamedeck-exophase-sync"},
    "tags": []
}

with open("/home/claude/gamedeck/n8n/gamedeck-exophase-sync.json", "w") as f:
    json.dump(workflow, f, indent=2)

print("nodes:", len(nodes))
print("connections:", len(connections))
print("valid json:", bool(json.dumps(workflow)))
