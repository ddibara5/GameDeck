# GameDeck

A live, self-updating database of my full Exophase game library (Xbox + PSN + Steam), a phone-first PWA to browse it, and a Claude-powered "what should I play next" chat grounded in the games I actually own.

## How it works

Every 6 hours, **n8n Cloud** pulls the library and play history from the platform APIs, with a private token-gated fallback proxy where needed. Parsed results are upserted into **Supabase** (Postgres): the live library, a per-day play-history log, and a run heartbeat.

A second n8n workflow enriches each game with **genre, release year, story length, and cover art from IGDB**.

The **React PWA on Vercel** uses owner-only email/password sign-in and reads through Supabase RLS. Its Discover tab calls an authenticated serverless function that runs **Claude (Haiku) with web search** to recommend what to play next, grounded in the games I own and my explicit ranking.

```
Exophase API ──6h──> n8n Cloud ──> FlareSolverr (Oracle VM)  [Cloudflare cleared]
                         │
                         ▼
                    Supabase (Postgres)
                    ├── games        (live library, upserted every 6h)
                    ├── play_events  (daily play-history deltas)
                    └── sync_runs    (run heartbeat)
                         ▲
   IGDB API ──6h──> n8n Cloud   (genre, release year, story length, cover)
                         │
       ┌─────────────────┴─────────────────┐
       ▼                                    ▼
 React PWA on Vercel ── /api/chat ──> Serverless fn ──> Claude (Haiku + web search)
 (reads via publishable key)          (secret key stays server-side)
```

## Stack

- **Database** - Supabase (Postgres) with row-level security; a read-only publishable key for the app, a service key for the sync.
- **Automation** - n8n Cloud, running two scheduled workflows (Exophase sync + IGDB enrichment).
- **Cloudflare bypass** - FlareSolverr (headless Chromium) on an Oracle Cloud Always-Free VM, fronted by a token-gated Caddy reverse proxy.
- **Frontend** - React + Vite PWA on Vercel, installable on mobile.
- **AI** - Claude (Haiku) via a Vercel serverless function, using web search for current game data.
- **Sources** - Exophase (library + play history), IGDB (metadata + covers).

Everything runs in the cloud with no local dependency.

## Repo layout

- `web/` - React + Vite PWA and the `api/` serverless functions (deployed by Vercel)
- `n8n/` - exported workflow definitions (Exophase sync, IGDB enrichment)
- `supabase/` - database schema
- `deploy/` - legacy local Docker stack (superseded by n8n Cloud + the Oracle VM)
- `GAMEDECK-CLOUD-HANDOFF.md` - cloud architecture, security/operations guidance, and the agent GitHub publishing bridge (sensitive resource IDs stay outside the public repo)
- `QUIET-DECK-HANDOFF.md` - approved UI baseline, navigation persistence, phase history, and final mobile visual-QA state
