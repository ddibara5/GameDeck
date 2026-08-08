# GameDeck - Cloud Architecture & Mobile Handoff

**Status:** Fully cloud. No Mac dependency. Both data workflows run automatically every 6 hours.
**Last verified:** 2026-08-08 - three consecutive full 509-game Exophase syncs (incl. an automatic scheduled run) + IGDB enrichment re-populating a test game end-to-end.
**Repo edits:** applied via the GitHub write bridge (section 8), because the Claude GitHub connector is read-only for writes.

This document is the single source of truth for operating and editing GameDeck from a phone (or by another agent). It contains **no secret values** - only where each secret lives.

---

## 1. What GameDeck is

A self-updating game-library app:
- **Exophase sync** pulls Dave's game library + play history into Supabase every 6h.
- **IGDB enrichment** fills in genre / release year / story length (HowLongToBeat-style) / cover art for any game missing it.
- A **React PWA on Vercel** reads Supabase and offers a Claude-powered "what to play next" chat (Discover tab).

---

## 2. Components & IDs

### Supabase (database)
- **Project URL:** `https://eiskobjlvxzwvucgpenk.supabase.co` (project ref `eiskobjlvxzwvucgpenk`)
- **Tables:** `games` (~508 rows), `play_events`, `sync_runs`; view `v_library_stats`
- **Secret (service) key:** Supabase dashboard -> Settings -> API Keys -> **Secret keys** (`sb_secret_...`). Also stored in the n8n credential below. The app frontend uses the **publishable** key.

### n8n Cloud (automation) - instance `ddibara-app-n8n-cloud`
Web UI: sign in at n8n Cloud; both data workflows are editable/runnable from a phone browser or via Claude with the n8n MCP connected.

| Workflow | ID | Active | Triggers |
|---|---|---|---|
| GameDeck \| Exophase - Daily Library & Play-History Sync | `FWUf7KNrSi0M8gKy` | Yes | Every 6h schedule |
| GameDeck \| IGDB Enrichment | `Cpu3vfesYWfqGSZb` | Yes | Manual + Every 6h schedule |
| GameDeck \| GitHub - Commit to main (Claude bridge) | `KD1L37RyiZHFv8aP` | No | Manual, via the n8n MCP (see section 8) |

**Credentials (in n8n Cloud credential store):**

| Name | ID | Type | Holds |
|---|---|---|---|
| GameDeck Supabase (service) | `BzffyRvqi5Coa0te` | supabaseApi | Supabase host + secret key |
| GameDeck FlareSolverr Token | `mKdp39mbFd23dnrV` | httpHeaderAuth | header `X-Flare-Token` (= VM `/opt/flare/token`) |
| GameDeck Twitch Secret | `PqndHWSnSZ1MTgX1` | httpQueryAuth | `client_secret` for Twitch/IGDB |
| GameDeck Github | `bvw0RqTiwltkaz0h` | githubApi | fine-grained GitHub PAT, this repo, Contents R/W (+ Pull requests R/W, unused now) |

### Oracle Cloud VM (FlareSolverr host - clears Exophase's Cloudflare)
- **Instance:** `gamedeck-flaresolverr`, region US-East (Ashburn), shape **VM.Standard.E2.1.Micro** (1 vCPU / 1 GB, Always Free), Ubuntu 22.04
- **Public IP:** `129.159.189.180`
- **SSH:** `ssh -i ~/.ssh/gamedeck_oracle ubuntu@129.159.189.180` (key currently only on Dave's Mac - see "Back up the SSH key" below)
- **Docker containers (auto-restart `unless-stopped`):**
  - `flaresolverr` - `ghcr.io/flaresolverr/flaresolverr:latest`, internal on the `flarenet` network, `--shm-size=384m`
  - `flarecaddy` - `caddy:2`, publishes `:8191`, requires header `X-Flare-Token`, reverse-proxies to `flaresolverr:8191`. Config: `/opt/flare/caddy/Caddyfile`
- **Token:** `/opt/flare/token` on the VM (also in the n8n FlareSolverr credential)
- **Extras:** 2 GB swap at `/swapfile`; OCI Security List ingress allows TCP 8191 (0.0.0.0/0, gated by the token); host `iptables` allows 8191 (persisted via `netfilter-persistent`)

### Twitch (for IGDB API)
- **client_id:** `00fblo6cy6xy4gi6u1yeatlgy2rp2w` (sent as `Client-ID` header - not secret)
- **client_secret:** in the n8n "GameDeck Twitch Secret" credential only

### Frontend (app)
- **GitHub repo:** `github.com/ddibara5/GameDeck` (Vercel root dir = `web/`)
- **Vercel:** builds the Vite React PWA + serverless `/api/chat` (Claude recommender with web search). Auto-deploys on push to `main`.
- Reads Supabase with the publishable key.
- **Optional API guard:** env var `GAMEDECK_APP_SECRET` gates `/api/chat` (see section 9). Fail-open: unset = endpoint open, so it is off until you opt in.

---

## 3. How the Exophase sync works (and why it's configured this way)

Flow: `Every 6h` -> `Build Page Requests` (18 page URLs: xbox 12, psn 3, steam 3 for player `5270041`) -> `Fetch via FlareSolverr` (POST to `http://129.159.189.180:8191/v1`, token via credential) -> `Parse Games` -> `Get Existing State` -> `Compute Deltas` -> `Upsert Games` -> `Insert Play Events` -> `Log Sync Run`.

**Critical config note - do not "optimize" naively:** the VM is 1 vCPU / 1 GB, so headless Chrome can only do **one page at a time**. The Fetch node is deliberately serialized (`options.batching` = batchSize 1, **batchInterval 20000 ms**) with 3 retries. This makes a run take ~6 minutes, which is fine (it's an unattended background job; the app never waits on it).

**Approaches that were tested and FAILED on this box (don't repeat):**
- Firing all 18 fetches at once -> Chrome thrash, load average ~11, crashes.
- A shared FlareSolverr session for speed -> concurrent navigations *race*, returning duplicate/empty pages (got 248-409 games instead of 509).
- Independent per-page fetch, serialized -> correct every time (509). This is what's shipped.

If you ever move to a bigger box (e.g. free Ampere A1 4 vCPU/24 GB, or a small paid VPS), you can drop the 20s spacing and/or use a persistent session for a ~40s run.

---

## 4. Operating from a phone

- **n8n Cloud web UI** (phone browser): open either workflow, tap **Execute Workflow** to run now, or check **Executions** for history/errors.
- **Claude on mobile** (with the n8n MCP + this doc): "run the GameDeck Exophase sync", "why did the last enrichment run fail?", "add 3 more psn pages", etc.
- **Supabase dashboard** (phone): inspect `games` / `sync_runs`.
- **Vercel + GitHub apps:** frontend deploys and code.

---

## 5. Common tasks & recovery

**Manually trigger a sync:** n8n UI -> open the workflow -> Execute Workflow. (IGDB also has a Manual Trigger node.)

**Exophase sync failing?** Check, in order:
1. VM reachable: `ssh -i ~/.ssh/gamedeck_oracle ubuntu@129.159.189.180 'sudo docker ps'` (both containers `Up`).
2. FlareSolverr healthy: `curl -s -H "X-Flare-Token: $(sudo cat /opt/flare/token)" http://localhost:8191/` -> "FlareSolverr is ready!".
3. Port open: from outside, `curl http://129.159.189.180:8191/` should return 403 (no token) - proves reachable + gated.
4. n8n **Executions** tab for the specific error.

**IGDB enrichment failing?** It doesn't use the VM at all - only Twitch + IGDB APIs. Check the n8n execution; most likely a bad/expired Twitch credential.

**VM rebooted?** Containers auto-restart; swap and firewall rules are persisted. Nothing to do.

**Rotate the FlareSolverr token:** on the VM, write a new value to `/opt/flare/token`, update the `X-Flare-Token` value in `/opt/flare/caddy/Caddyfile`, `sudo docker restart flarecaddy`, then update the **GameDeck FlareSolverr Token** credential value in n8n.

---

## 6. Security model

Secrets live in exactly four places and nowhere else (never in code or committed files):
- Supabase dashboard (DB keys)
- Vercel project env (frontend/API keys; optional `GAMEDECK_APP_SECRET` guard)
- n8n Cloud credential store (Supabase service key, FlareSolverr token, Twitch secret, GitHub PAT)
- VM `/opt/flare/token` (FlareSolverr proxy token)

The FlareSolverr port is open to the internet but every request without the token gets a 403, so the box can't be abused as an open scraping proxy.

---

## 7. Back up the SSH key (important)

The only key to the VM, `~/.ssh/gamedeck_oracle` (+ `.pub`), currently exists **only on Dave's Mac**. To manage the VM from another device or let another agent SSH in, either copy that keypair somewhere secure (password manager / secure note) or add a new public key to the instance via the OCI console. Without it, VM administration requires generating a new key through Oracle's console.

---

## 8. Editing the repo from an agent (GitHub write bridge)

Anthropic's first-party Claude GitHub connector is **read-only for writes**: it can read the repo, but every create/update/merge returns 403. To let Claude (or any agent with the n8n MCP) commit changes, an n8n workflow writes to GitHub using a fine-grained PAT.

- **Workflow:** `GameDeck | GitHub - Commit to main (Claude bridge)`, ID `KD1L37RyiZHFv8aP`. Left **inactive on purpose**: it is triggered through the n8n MCP `execute_workflow` call, not a public URL, so there is no open webhook listener.
- **Credential:** `GameDeck Github` (`bvw0RqTiwltkaz0h`, type `githubApi`) - a fine-grained PAT for this repo with Contents read/write.
- **What it does:** takes one or more files and commits them all as a **single atomic commit straight to `main`** via GitHub's Git Data API (blobs -> one tree on top of main -> one commit -> fast-forward `main`). No branch, no PR, no merge. Files not passed are left untouched.

**Invoke it** (n8n MCP `execute_workflow`, workflow `KD1L37RyiZHFv8aP`, webhook input `body`):
```json
{
  "message": "your commit message",
  "files": [
    { "path": "web/api/chat.js", "content": "<base64 of the file>" }
  ]
}
```
Then read the execution: the `Create commit` node returns the commit URL and `Update main ref` returns the new `main` sha.

**Design notes / limits:**
- `content` must be **base64**. The commit is atomic (all files in one commit) and **fast-forward only** (its parent is main's current head, so it never force-overwrites; if `main` moved mid-run it fails safe instead of clobbering).
- It can **add or update** files, not delete them (deleting needs a tree entry with `sha: null`; add that mode if ever needed).
- For very large or many-file changes, hand the payload in as a fetched URL instead of inline base64 (same result).
- **History:** commits land directly on `main` with no review gate. Fine for a solo repo; a bad change is one `git revert` away.

**Why this shape (what was tried and rejected):** the first version committed each file separately via the Contents API and opened a PR. Firing the per-file commits concurrently raced on the branch head and returned 409 (once the first commit moved the ref, the rest conflicted). The Git Data API path (one tree, one commit) is atomic and has no such race, so it replaced it.

---

## 9. Optional: /api/chat access guard

`/api/chat` is the only endpoint that spends money (Anthropic API + up to 4 web searches per message); every other tab reads Supabase directly under read-only RLS. A lightweight shared-secret guard can gate it.

- **Server (`web/api/chat.js`):** if env var `GAMEDECK_APP_SECRET` is set in Vercel, every request must send a matching `x-gamedeck-key` header, else `401`. If unset, the check is skipped (**fail-open**), so deploying the code never breaks the app.
- **Client (`web/src/lib/appAuth.js` + `web/src/components/DiscoverTab.jsx`):** the key is **not** compiled into the JS bundle; it lives in the browser's `localStorage` (`gamedeck_app_key_v1`), is sent as `x-gamedeck-key`, and the app prompts once on a `401` then stores it on-device.

**To activate:** add `GAMEDECK_APP_SECRET` (a long random string) in the Vercel project env, redeploy (env changes only take effect on a new deployment), then enter the same value once on the phone when Discover prompts. **To rotate/revoke:** change the Vercel value, redeploy, re-enter on the phone. It is one shared secret (not per-user auth) - appropriate spend-protection for a single-user app.

---

## 10. What was removed from the Mac (retired)

- Local Docker stack (`deploy-n8n-1`, `deploy-flaresolverr-1`) - stopped & removed.
- Docker Desktop app, CLI, images, and the ~4.5 GB VM disk - uninstalled. (A couple of empty, macOS-protected container *stub* folders remain by design; harmless.)
- **Kept:** the `~/gamedeck` project files, `~/gamedeck/deploy/.env` (local reference; gitignored), and `~/.ssh/gamedeck_oracle` (needed for the VM).
