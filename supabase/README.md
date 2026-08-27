# Supabase change management

The live project predates the migration folder. Historical migration names remain
in Supabase's migration ledger; every change from 24 August 2026 forward is
committed here before it is applied.

The current owner-security and recommendation-learning migrations are:

- `20260824230000_owner_auth_rankings_and_event_integrity.sql`
- `20260827023226_recommendation_outcome_learning.sql`
- `20260827023302_recommendation_outcome_advisor_cleanup.sql`

Verification after each migration:

1. Anonymous REST reads return no private rows.
2. A signed JWT for the configured owner can read the library and write only the
   user-editable tables/functions.
3. Service-role sync writes still succeed.
4. Supabase security and performance advisors have no new errors.
5. Same-state play-event retries do not add minutes twice.
6. Recommendation exposures and detail opens are append-only and owner-scoped;
   anonymous inserts are denied.
7. Recommendation outcome views remain `security_invoker`, use latest-touch
   attribution, and add no new advisor findings.
