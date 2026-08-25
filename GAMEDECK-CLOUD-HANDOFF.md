# GameDeck cloud handoff

This public document intentionally contains no project references, workflow IDs,
credential IDs, host addresses, tokens, account identifiers, or recovery-key
locations. Keep the operational inventory in the team's private password manager
or infrastructure console, not in the repository.

## Architecture

- Vercel hosts the React PWA and the authenticated serverless API routes.
- Supabase stores the game library, activity, wishlist, statuses, and rankings.
- n8n runs scheduled platform syncs and the gaming-news refresh.
- A private, token-gated scraping proxy supports the fallback library source.
- Twitch/IGDB provides catalog metadata and art.
- Anthropic powers the authenticated game concierge.

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
