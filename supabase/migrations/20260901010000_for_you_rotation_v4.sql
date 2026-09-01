-- Durable For You rotation: explicit dismissals plus model-v4-only fatigue.
-- The v3 exposure stream over-counted app remounts, so cooldown evidence starts
-- clean with v4 rather than retroactively hiding most of the candidate pool.

create table public.recommendation_dismissals (
  igdb_id bigint primary key check (igdb_id > 0),
  title text not null check (char_length(title) between 1 and 300),
  dismissed_at timestamptz not null default now()
);

comment on table public.recommendation_dismissals is
  'Owner-curated permanent exclusions from For You. Rows can be restored by deleting them.';

alter table public.recommendation_dismissals enable row level security;

create policy owner_read_recommendation_dismissals
  on public.recommendation_dismissals
  for select
  to authenticated
  using ((select public.is_gamedeck_owner()));

create policy owner_insert_recommendation_dismissals
  on public.recommendation_dismissals
  for insert
  to authenticated
  with check ((select public.is_gamedeck_owner()));

create policy owner_delete_recommendation_dismissals
  on public.recommendation_dismissals
  for delete
  to authenticated
  using ((select public.is_gamedeck_owner()));

grant select, insert, delete on public.recommendation_dismissals to authenticated;

create or replace view public.v_recommendation_lane_feedback
with (security_invoker = true)
as
select
  lane_key,
  count(*)::integer as exposure_count,
  count(*) filter (where detail_opened)::integer as detail_open_count,
  count(*) filter (
    where wishlisted or became_owned or played or positive_rank
  )::integer as meaningful_outcome_count,
  max(shown_at) as last_shown_at
from public.v_recommendation_outcomes
where shown_at >= now() - interval '180 days'
  and model_version = 'for_you_v4'
group by lane_key;

comment on view public.v_recommendation_lane_feedback is
  'Model-v4 lane evidence used after a minimum sample and with a capped multiplier.';

create or replace view public.v_recommendation_game_feedback
with (security_invoker = true)
as
with scoped as (
  select *
  from public.v_recommendation_outcomes
  where shown_at >= now() - interval '180 days'
    and model_version = 'for_you_v4'
),
summary as (
  select
    igdb_id,
    count(*)::integer as exposure_count,
    count(*) filter (where detail_opened)::integer as detail_open_count,
    count(*) filter (
      where wishlisted or became_owned or played or positive_rank
    )::integer as meaningful_outcome_count,
    max(shown_at) as last_shown_at,
    max(shown_at) filter (
      where detail_opened or wishlisted or became_owned or played or positive_rank
    ) as last_positive_at
  from scoped
  group by igdb_id
)
select
  summary.igdb_id,
  summary.exposure_count,
  summary.detail_open_count,
  summary.meaningful_outcome_count,
  summary.last_shown_at,
  (
    select count(*)::integer
    from scoped exposure
    where exposure.igdb_id = summary.igdb_id
      and not (
        exposure.detail_opened
        or exposure.wishlisted
        or exposure.became_owned
        or exposure.played
        or exposure.positive_rank
      )
      and (
        summary.last_positive_at is null
        or exposure.shown_at > summary.last_positive_at
      )
  ) as ignored_streak,
  summary.last_positive_at
from summary;

comment on view public.v_recommendation_game_feedback is
  'Model-v4 per-game evidence with a positive-reset ignored streak for graduated cooldowns.';

grant select on public.v_recommendation_lane_feedback,
  public.v_recommendation_game_feedback to authenticated;
