-- The interaction uniqueness index already supports the only interaction lookup
-- used by the outcome view. Avoid carrying a redundant write-cost index.
drop index if exists public.recommendation_interactions_type_time_idx;
