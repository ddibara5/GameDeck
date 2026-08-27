-- Structured recommendation exposure and outcome learning for GameDeck.
-- Browser writes are append-only and owner-scoped. Purchase, play, wishlist,
-- and ranking outcomes stay derived from their existing source-of-truth tables.

create table public.recommendation_exposures (
  id bigint generated always as identity primary key,
  exposure_key text not null unique
    check (char_length(exposure_key) between 10 and 180),
  igdb_id bigint not null check (igdb_id > 0),
  title text not null check (char_length(title) between 1 and 300),
  surface text not null check (surface in ('for_you', 'ask_ai')),
  lane_key text not null check (char_length(lane_key) between 1 and 80),
  position smallint not null check (position between 1 and 50),
  model_version text not null default 'for_you_v3'
    check (char_length(model_version) between 1 and 80),
  context jsonb not null default '{}'::jsonb
    check (jsonb_typeof(context) = 'object'),
  shown_at timestamptz not null default now()
);

comment on table public.recommendation_exposures is
  'One immutable row per structured recommendation shown in a browser session. Outcomes are attributed separately or inferred from trusted GameDeck tables.';

create table public.recommendation_interactions (
  id bigint generated always as identity primary key,
  exposure_id bigint not null references public.recommendation_exposures(id) on delete cascade,
  event_type text not null check (event_type in ('detail_open')),
  occurred_at timestamptz not null default now(),
  unique (exposure_id, event_type)
);

comment on table public.recommendation_interactions is
  'Deduplicated explicit interactions with a recommendation exposure. Purchase, play, wishlist, and ranking outcomes remain derived from their source tables.';

create index recommendation_exposures_game_shown_idx
  on public.recommendation_exposures (igdb_id, shown_at desc, id desc);

create index recommendation_exposures_lane_shown_idx
  on public.recommendation_exposures (lane_key, shown_at desc);

alter table public.recommendation_exposures enable row level security;
alter table public.recommendation_interactions enable row level security;

create policy owner_read_recommendation_exposures
  on public.recommendation_exposures
  for select
  to authenticated
  using ((select public.is_gamedeck_owner()));

create policy owner_insert_recommendation_exposures
  on public.recommendation_exposures
  for insert
  to authenticated
  with check ((select public.is_gamedeck_owner()));

create policy owner_read_recommendation_interactions
  on public.recommendation_interactions
  for select
  to authenticated
  using ((select public.is_gamedeck_owner()));

create policy owner_insert_recommendation_interactions
  on public.recommendation_interactions
  for insert
  to authenticated
  with check (
    (select public.is_gamedeck_owner())
    and exists (
      select 1
      from public.recommendation_exposures exposure
      where exposure.id = recommendation_interactions.exposure_id
    )
  );

grant select, insert on public.recommendation_exposures,
  public.recommendation_interactions to authenticated;
grant usage, select on sequence public.recommendation_exposures_id_seq,
  public.recommendation_interactions_id_seq to authenticated;

create view public.v_recommendation_outcomes
with (security_invoker = true)
as
select
  exposure.id as exposure_id,
  exposure.igdb_id,
  exposure.title,
  exposure.surface,
  exposure.lane_key,
  exposure.position,
  exposure.model_version,
  exposure.shown_at,
  exists (
    select 1
    from public.recommendation_interactions interaction
    where interaction.exposure_id = exposure.id
      and interaction.event_type = 'detail_open'
      and interaction.occurred_at >= exposure.shown_at
      and interaction.occurred_at < exposure.shown_at + interval '30 days'
  ) as detail_opened,
  exists (
    select 1
    from public.wishlist item
    where item.igdb_id = exposure.igdb_id
      and item.created_at >= exposure.shown_at
      and item.created_at < exposure.shown_at + interval '30 days'
      and not exists (
        select 1
        from public.recommendation_exposures newer
        where newer.igdb_id = exposure.igdb_id
          and (newer.shown_at, newer.id) > (exposure.shown_at, exposure.id)
          and newer.shown_at <= item.created_at
      )
  ) as wishlisted,
  exists (
    select 1
    from public.games game
    where game.igdb_id = exposure.igdb_id
      and game.first_seen >= exposure.shown_at
      and game.first_seen < exposure.shown_at + interval '90 days'
      and not exists (
        select 1
        from public.recommendation_exposures newer
        where newer.igdb_id = exposure.igdb_id
          and (newer.shown_at, newer.id) > (exposure.shown_at, exposure.id)
          and newer.shown_at <= game.first_seen
      )
  ) as became_owned,
  exists (
    select 1
    from public.games game
    where game.igdb_id = exposure.igdb_id
      and game.first_played >= exposure.shown_at
      and game.first_played < exposure.shown_at + interval '180 days'
      and not exists (
        select 1
        from public.recommendation_exposures newer
        where newer.igdb_id = exposure.igdb_id
          and (newer.shown_at, newer.id) > (exposure.shown_at, exposure.id)
          and newer.shown_at <= game.first_played
      )
  ) as played,
  exists (
    select 1
    from public.games game
    join public.game_ranks rank on rank.master_id = game.master_id
    where game.igdb_id = exposure.igdb_id
      and rank.reaction in ('loved', 'liked')
      and rank.updated_at >= exposure.shown_at
      and rank.updated_at < exposure.shown_at + interval '180 days'
      and not exists (
        select 1
        from public.recommendation_exposures newer
        where newer.igdb_id = exposure.igdb_id
          and (newer.shown_at, newer.id) > (exposure.shown_at, exposure.id)
          and newer.shown_at <= rank.updated_at
      )
  ) as positive_rank
from public.recommendation_exposures exposure
where exposure.shown_at >= now() - interval '365 days';

comment on view public.v_recommendation_outcomes is
  'Latest-touch recommendation attribution. Explicit opens and inferred wishlist, ownership, play, and positive-rank outcomes use bounded attribution windows.';

create view public.v_recommendation_lane_feedback
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
group by lane_key;

comment on view public.v_recommendation_lane_feedback is
  'Six-month lane evidence used by the client only after a minimum sample and with a capped multiplier.';

create view public.v_recommendation_game_feedback
with (security_invoker = true)
as
select
  igdb_id,
  count(*)::integer as exposure_count,
  count(*) filter (where detail_opened)::integer as detail_open_count,
  count(*) filter (
    where wishlisted or became_owned or played or positive_rank
  )::integer as meaningful_outcome_count,
  max(shown_at) as last_shown_at
from public.v_recommendation_outcomes
where shown_at >= now() - interval '180 days'
group by igdb_id;

comment on view public.v_recommendation_game_feedback is
  'Six-month per-game evidence for small positive reinforcement and fatigue suppression.';

grant select on public.v_recommendation_outcomes,
  public.v_recommendation_lane_feedback,
  public.v_recommendation_game_feedback to authenticated;
