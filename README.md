# GameDeck

A live, self-updating database of your full Exophase game library (Xbox + PSN + Steam), a phone-first PWA to browse it, and a Claude-powered "what should I play next" chat grounded in the games you actually own.

## How it fits together

```
Exophase API ──(daily)──> n8n ──> FlareSolverr ──> Cloudflare cleared
                            │
                            ▼
                       Supabase (Postgres)
                       ├── games         (live library, upserted daily)
                       ├── play_events   (play-history log: deltas per day)
                       └── sync_runs      (heartbeat)
                            │
        ┌───────────────────┴───────────────────┐
        ▼                                         ▼
  React PWA on Vercel  ── POST /api/chat ──>  Serverless fn ──> Claude (Haiku)
  (reads with anon key)                        (reads library, key stays server-side)
```

Why FlareSolverr: Exophase sits behind Cloudflare, which 403s any datacenter IP (tested: your VPS will be blocked hitting the API directly). FlareSolverr runs a headless Chromium that clears the challenge. It is free, self-hosted, and runs as a sidecar next to n8n. No scraping subscription needed.

## What you need

- A Supabase account (free tier is enough).
- A small VPS with Docker, ~2 GB RAM (for n8n + FlareSolverr). A home server works too.
- A Vercel account (Hobby / free) for the app.
- An Anthropic API key (pay-as-you-go, no subscription).

---

## Step 1 - Supabase (database)

1. Create a new project at supabase.com. Pick a region near you.
2. Open **SQL Editor > New query**, paste all of `supabase/schema.sql`, and run it. That creates the tables, views, and read-only RLS policies.
3. Grab your keys from **Project Settings > API**:
   - Project URL -> `https://YOUR-PROJECT.supabase.co`
   - `anon` public key (safe for the app; read-only via RLS)
   - `service_role` key (secret; used ONLY by n8n to write)

Note: the free tier pauses a project after ~7 days of no activity. The daily sync counts as activity, so once the pipeline runs it stays awake.

---

## Step 2 - Data pipeline (n8n + FlareSolverr)

Runs on any machine with Docker. On a Mac, use your own laptop (Docker Desktop, free) - no VPS or new hardware needed. Your home IP is residential, so FlareSolverr clears Cloudflare with no trouble.

Fastest path: `cd deploy && ./setup.sh` (checks Docker, asks for your Supabase URL, brings up the stack, imports the workflow). Then do the credential steps below in the UI. Manual path:

1. Copy the `deploy/` folder up. `cp .env.example .env` and set `SUPABASE_URL`.
2. `docker compose up -d` (starts n8n on `:5678` and FlareSolverr internally).
3. Open `http://localhost:5678`, create the n8n owner account.
4. **Add the Supabase credential**: Credentials > New > **Supabase API**. Name it exactly `GameDeck Supabase (service role)`. Host = your project URL, Service Role Secret = the `service_role` key.
5. **Import the workflow**: Workflows > Import from File > `n8n/gamedeck-exophase-sync.json`.
6. Open each of the 4 HTTP nodes (Get Existing State, Upsert Games, Insert Play Events, Log Sync Run) and confirm the credential dropdown points at your Supabase credential (they reference it by name; re-select if it shows "REPLACE").
7. Click **Execute Workflow** once to backfill the database. First run inserts ~830 games and marks them all `is_new` (no fake playtime). Check Supabase > Table Editor > `games` fills up.
8. Toggle the workflow **Active**. It runs **every 6 hours** while the machine is on. On a laptop that sleeps, n8n does not catch up missed runs, but that's fine here: the delta logic self-heals (playtime still accumulates correctly, only day-attribution gets coarser). Every-6h means it fires whenever your Mac is awake for a stretch. You can also hit Execute anytime.

How play history works: each run compares the fresh pull to what's in `games`. When a game's playtime or achievement count goes up, it writes a `play_events` row with the delta. So `play_events` becomes a real "what I played and when" log. Same-day re-runs are idempotent (upsert on `master_id, event_date`).

---

## Step 3 - The app + AI (Vercel)

1. Push the `web/` folder to a GitHub repo (or drag-drop deploy).
2. In Vercel: New Project > import the repo. Framework preset = **Vite**. Root directory = the folder containing `package.json` (i.e. `web`).
3. Set **Environment Variables** (Project Settings > Environment Variables):

   | Name | Value | Exposed to |
   |---|---|---|
   | `VITE_SUPABASE_URL` | your project URL | client (fine) |
   | `VITE_SUPABASE_ANON_KEY` | anon key | client (fine, read-only) |
   | `ANTHROPIC_API_KEY` | your Anthropic key | server only |
   | `SUPABASE_URL` | your project URL | server only |
   | `SUPABASE_ANON_KEY` | anon key | server only |
   | `CLAUDE_MODEL` | `claude-haiku-4-5` (optional) | server only |

4. Deploy. Open the URL on your phone, then **Add to Home Screen** to install it as an app (it's a PWA with offline shell caching).

The `/api/chat` function loads your library from Supabase server-side and sends it to Claude with your taste baked in (RPGs, FromSoft, Rockstar; skips VR/sports/esports/MMO/battle royale). The Anthropic key never touches the browser. The library is sent as a cached prompt block, so follow-up questions in a session are ~10x cheaper.

---

## Costs (verified Aug 2026)

- **Supabase**: free tier (500 MB DB). Your data is a few MB; play history grows only when you actually play. Comfortably free.
- **Vercel**: Hobby plan free (personal, non-commercial).
- **VPS**: ~$5-6/mo for n8n + FlareSolverr (or $0 on a home server you already run).
- **Claude API (Haiku 4.5)**: $1 / million input tokens, $5 / million output. A recommendation turn is well under a cent; prompt caching makes repeat turns cheaper. Realistically a few cents a month at personal use.

No new subscriptions. The only usage-metered cost is the Anthropic key, pay-as-you-go.

---

## Notes and fallbacks

- **Library growth**: the workflow fetches Xbox pages 1-20, PSN 1-3, Steam 1-3 (huge headroom over your current 732 / 61 / 37). If Xbox ever passes ~1000 games, bump the `20` in the "Build Page Requests" node.
- **If FlareSolverr ever fails** (Cloudflare tightens): the fetch node retries 3x. Options, cleanest first: (1) update the FlareSolverr image (`docker compose pull && up -d`); (2) run FlareSolverr on a residential IP (home box) and point `FLARESOLVERR_URL` at it over your VPN/Tailscale; (3) swap in a scraping API with a free tier by changing only the "Fetch via FlareSolverr" node's URL/body.
- **n8n Cloud instead of a VPS**: managed n8n Cloud can't run a FlareSolverr sidecar, so you'd have to expose FlareSolverr publicly (not recommended). The docker-compose VPS route keeps everything private and free-of-subscription, which is why it's the default here.
- **Player id**: `5270041` is your Exophase account-wide id (already set in the workflow). It's the only id whose `environment` filter works across all three platforms.
- **Security**: the app uses the anon key with row-level security that allows reads only. All writes require the service_role key, which lives only in n8n. The Anthropic key lives only in the Vercel function.

## Files

```
gamedeck/
├── README.md                         <- you are here
├── supabase/schema.sql               <- run once in Supabase
├── n8n/gamedeck-exophase-sync.json   <- import into n8n
├── n8n/build_workflow.py             <- (source that generated the JSON)
├── deploy/docker-compose.yml         <- n8n + FlareSolverr
├── deploy/.env.example
└── web/                              <- the React PWA
    ├── api/chat.js                   <- serverless Claude function
    └── src/...                        <- app source
```
