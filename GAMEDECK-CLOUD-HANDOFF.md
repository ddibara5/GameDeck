# GameDeck cloud handoff

For the approved Quiet Deck UI baseline, phase history, and installed-PWA review
state, also read `QUIET-DECK-HANDOFF.md` before changing presentation or navigation.

This public document intentionally contains no project references, workflow IDs,
credential IDs, host addresses, tokens, account identifiers, or recovery-key
locations. Keep the operational inventory in the team's private password manager
or infrastructure console, not in the repository.

## Architecture

- Vercel hosts the React PWA and the authenticated serverless API routes.
- Supabase stores the game library, activity, wishlist, statuses, rankings, and
  the current Game Pass catalog.
- n8n runs scheduled platform syncs and the gaming-news refresh.
- A private, token-gated scraping proxy supports the fallback library source.
- Twitch/IGDB provides catalog metadata and art.
- Anthropic powers the authenticated game concierge.

The concierge loads one owner-scoped evidence bundle through the signed browser
JWT: library ownership is required; recent activity, explicit/derived statuses,
My Ranking, wishlist intent, and Game Pass availability are optional sections
that fail independently. `web/src/lib/gameIntelligence.js` owns the shared
recent-activity and ranking semantics used by both this server bundle and the
For You client. Keep those meanings aligned when changing recommendation logic.

## Security boundary

- The browser signs in with a Supabase magic link for the configured owner email.
- Postgres RLS checks the signed JWT email on every browser-visible table.
- Vercel API routes validate the same JWT before spending third-party quota or
  triggering automation.
- n8n writes with a service role and therefore remains independent of browser RLS.
- Publishable keys may be in the client; service keys and provider secrets may not.
- Webhook URLs and tokens stay in Vercel and n8n environment/credential stores.

## Operations

Use the provider dashboards to locate the resources by the `GameDeck` name. The
private operations record should hold the exact identifiers and these recovery
procedures:

1. Verify the latest Vercel deployment and function errors.
2. Check the latest n8n execution for each platform sync.
3. Inspect `sync_runs` and each platform's `direct_synced_at` timestamp.
4. Verify the private proxy is healthy and still token-gated.
5. Rotate a compromised secret in its provider, then update only the dependent
   Vercel or n8n credential and redeploy/retest.

### Game Pass catalog safety

The nightly Game Pass workflow authenticates its `/api/discover` matching calls
with the existing private n8n server credential; it does not use or imitate the
owner's browser session. It validates at least 400 resolved Microsoft titles,
300 matched IGDB rows, and a 60% match floor before writing.

The workflow must never clear `public.gamepass` directly. Its final step calls
`replace_gamepass_catalog`, a service-role-only RPC that validates uniqueness and
required fields and performs delete-plus-insert in one transaction. Any rejected
payload or insert error preserves the prior catalog. Failures stop the workflow
and route to the shared error workflow. The Home client considers a zero-row or
more-than-36-hour-old catalog unavailable; a fresh catalog with zero leaving rows
is a healthy empty state and remains hidden.

## Git publishing bridge

The connected GitHub app may be able to read this repository while still being
unable to create refs. In that case, use the inactive n8n GitHub bridge through
the authenticated n8n connectors.

For small, locally validated UI increments, Dave's preferred review path is a
single focused commit to `main` so the installed PWA receives the Vercel
production deployment. Re-read the current `main` ref, build and test locally,
then run `GameDeck | GitHub - Commit to branch (Codex bridge)` manually with
`{ branch: "main", allowMain: true, message, files }`. Confirm the resulting Git
tree and the READY production deployment. Roll back with a new revert commit or
the previous Vercel production deployment; do not rewrite `main` history.

Use an isolated branch for broader or higher-risk work:

1. Run `GameDeck | GitHub - Create branch (Codex bridge)` manually through the
   n8n official connector with webhook input `{ branch, sourceBranch }`.
   `sourceBranch` defaults to `main`, and the workflow refuses to create `main`.
2. Build and test locally on a branch with the same name.
3. Run `GameDeck | GitHub - Commit to branch (Codex bridge)` manually with
   `{ branch, message, files }`. Each file accepts repo-relative `path` plus raw
   UTF-8 `text`, base64 `content`, strict `patches`, or a fetchable `url`.
   Never put raw UTF-8 in `content`; that field is decoded as base64.
4. Confirm the execution succeeded and the branch head moved. Vercel is linked
   directly to this GitHub repository, so the branch commit should create the
   preview deployment; inspect that deployment before merging.

Both bridge workflows are intentionally inactive but available to the n8n MCP
connectors. Execute their drafts in `manual` mode. Never publish their webhook
triggers: the webhooks themselves are not an authentication boundary. The commit
workflow blocks `main` unless the caller explicitly passes `allowMain: true`.
The legacy delete bridge remains hard-coded to `main`; do not use it for isolated
branch work.

## Database changes

All new database changes belong in `supabase/migrations/`. Apply migrations with
the Supabase migration tool, then run the security and performance advisors and
verify both an anonymous denial and an authenticated owner read.

## Ranking model

`game_ranks` stores explicit reaction seeds and Elo scores.
`rank_comparisons` stores each comparison, including `skip`; skipped pairs are
suppressed by the client for 90 days. The database functions
`set_rank_reaction` and `record_rank_comparison` are the only ranking write path,
so score changes are transactional and cannot be forged by a client update.

## Same-day activity integrity

The syncs continue to upsert one aggregate row per game and calendar day. The
`play_events_merge_same_day` trigger adds only progress beyond the stored
after-state. This preserves multiple same-day sessions and makes webhook retries
idempotent without coordinating four independent workflows.
