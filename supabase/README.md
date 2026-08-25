# Supabase change management

The live project predates the migration folder. Historical migration names remain
in Supabase's migration ledger; every change from 24 August 2026 forward is
committed here before it is applied.

The current security/ranking migration is:

- `20260824230000_owner_auth_rankings_and_event_integrity.sql`

Verification after each migration:

1. Anonymous REST reads return no private rows.
2. A signed JWT for the configured owner can read the library and write only the
   user-editable tables/functions.
3. Service-role sync writes still succeed.
4. Supabase security and performance advisors have no new errors.
5. Same-state play-event retries do not add minutes twice.
