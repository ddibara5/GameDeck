# Runbook: set up GameDeck on this Mac (for the AI assistant)

You are running in a LOCAL Cowork session with shell access to Dave's Mac. Your job is to
stand up GameDeck end to end, doing everything possible via shell/CLI and pausing only when
you need Dave to create an account or paste a secret. Read `README.md` in this folder first
for the full architecture; this file is the execution order.

Ground rules
- Do the scriptable work yourself (unzip, Docker, psql, Vercel CLI, curl checks). Don't make
  Dave run commands you can run.
- When you need a secret or an account created, STOP and ask him for that one thing, then continue.
- Never print secrets back to the screen or write them into any file that isn't `.env` / the
  Vercel project. The Anthropic key and Supabase service_role key are sensitive.
- Verify each phase before moving on. Confirm the games table actually populated before Vercel.

Facts you'll need (already verified, don't re-derive)
- Exophase is behind Cloudflare and 403s datacenter IPs; that's why the pipeline routes fetches
  through a local FlareSolverr container. Running on Dave's Mac (residential IP) is fine.
- Exophase player id is `5270041` (already baked into the workflow).
- Claude model for the app is `claude-haiku-4-5`.
- The pipeline half (n8n + FlareSolverr) is fully scriptable via `deploy/setup.sh`.
  The app half is Supabase (managed) + Vercel (managed).

---

## Phase 0 - unpack
- `unzip` the provided `gamedeck.zip` to a working folder. `cd gamedeck`.

## Phase 1 - Docker (local pipeline host)
- Check: `docker info`. If Docker isn't installed, install Docker Desktop:
  `brew install --cask docker` then tell Dave to open Docker Desktop once (first launch needs a
  GUI accept), and wait until `docker info` succeeds.

## Phase 2 - Supabase (needs Dave)
PAUSE and ask Dave to:
  1. Create a project at supabase.com (any region near him).
  2. From Project Settings > API, give you: the Project URL, the `anon` key, the `service_role` key.
  3. From Project Settings > Database > Connection string (URI, "Direct connection"), give you the
     `postgresql://...` string (it contains the DB password).

Then you:
- Install a psql client if missing: `brew install libpq` and use `/opt/homebrew/opt/libpq/bin/psql`
  (or `brew install postgresql@16`).
- Run the schema:
  `psql "<CONNECTION_STRING>" -f supabase/schema.sql`
- Verify: `psql "<CONNECTION_STRING>" -c "\dt public.*"` shows games, play_events, sync_runs.

## Phase 3 - pipeline up (you)
- `cd deploy && ./setup.sh`
  It will ask for the Supabase URL (paste the Project URL), start n8n + FlareSolverr, and import
  the workflow. Wait until it prints the local URL.

## Phase 4 - n8n credential + first run (needs Dave, ~5 clicks)
The n8n service_role credential and workflow activation are done in the n8n UI. If Claude-in-Chrome
is available locally, you may drive it; otherwise open `http://localhost:5678` and walk Dave through:
  1. Create the n8n owner account.
  2. Credentials > New > "Supabase API". Name it EXACTLY `GameDeck Supabase (service role)`.
     Host = Project URL, Service Role Secret = the service_role key.
  3. Open the workflow "GameDeck | Exophase - Daily Library & Play-History Sync". On each of the 4
     HTTP nodes (Get Existing State, Upsert Games, Insert Play Events, Log Sync Run) set the
     credential dropdown to that Supabase credential.
  4. Click Execute Workflow once. It should finish green and insert ~830 games.
  5. Toggle the workflow Active (runs every 6 hours while the Mac is on).

Verify the backfill (you):
- `curl -s "<PROJECT_URL>/rest/v1/games?select=master_id" -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" | wc -c`
  should be large (hundreds of rows). Or psql: `select count(*) from public.games;` ~= 830.
- If it's 0: open the "Fetch via FlareSolverr" node's last execution. If it shows a Cloudflare
  "Just a moment" page, `docker compose -f deploy/docker-compose.yml pull && up -d` to refresh
  FlareSolverr and re-run.

## Phase 5 - app + AI on Vercel (you + Dave for the key)
PAUSE and ask Dave for an Anthropic API key (console.anthropic.com > API keys; add a few dollars of
credit under Billing). Then:
- `cd ../web`
- `npm install`  then confirm `npm run build` passes.
- Deploy with the Vercel CLI:
  - `npm i -g vercel` (or use `npx vercel`).
  - `vercel login` (Dave completes the browser device-auth).
  - `vercel link` (create a new project; root is this `web` folder; framework = Vite).
  - Add env vars (each reads the value from stdin, add to all environments):
    - `printf %s "<PROJECT_URL>"  | vercel env add VITE_SUPABASE_URL production`
    - `printf %s "<ANON_KEY>"     | vercel env add VITE_SUPABASE_ANON_KEY production`
    - `printf %s "<ANTHROPIC_KEY>"| vercel env add ANTHROPIC_API_KEY production`
    - `printf %s "<PROJECT_URL>"  | vercel env add SUPABASE_URL production`
    - `printf %s "<ANON_KEY>"     | vercel env add SUPABASE_ANON_KEY production`
    - (repeat for `preview` and `development` if you want previews to work, or just production)
  - `vercel --prod` to build and deploy.
- Give Dave the deployed URL and tell him to open it on his phone and Add to Home Screen.

## Phase 6 - final verification
- Open the deployed URL. The Library tab should list games with covers.
- On the Discover tab, send "What should I play next?" and confirm a reply comes back (this proves
  the serverless function, the Anthropic key, and the Supabase read all work).
- Report a short summary: games synced, workflow active, app URL.

Notes
- If Dave prefers not to keep his Mac on, the same `deploy/` stack runs unchanged on an
  Oracle Cloud Always Free VM (2 OCPU / 12 GB ARM, $0) for always-on syncing.
- Nothing here needs a paid subscription; the only metered cost is the Anthropic key (a few
  cents/month at personal use).
